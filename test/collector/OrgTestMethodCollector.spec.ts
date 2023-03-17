/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */
import { AuthInfo, Connection } from '@apexdevtools/sfdx-auth-helper';
import {
  MockTestOrgData,
  testSetup,
} from '@apexdevtools/sfdx-auth-helper/lib/src/testSetup';
import { StreamingClient } from '@salesforce/apex-node/lib/src/streaming';
import { createSandbox, SinonSandbox, SinonStub, match } from 'sinon';
import { expect } from 'chai';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { QueryHelper } from '../../src/query/QueryHelper';
import { ApexClassInfo } from '../../src/query/ClassSymbolLoader';
import { setupQueryApexClassesSOAP } from '../Setup';
import { OrgTestMethodCollector } from '../../src/collector/OrgTestMethodCollector';
import { Record } from 'jsforce';

const $$ = testSetup();
let mockConnection: Connection;
let sandboxStub: SinonSandbox;
let toolingRequestStub: SinonStub;
let queryStub: SinonStub<[string, string, string], Promise<Record<any>[]>>;
const testData = new MockTestOrgData();

describe('messages', () => {
  beforeEach(async () => {
    sandboxStub = createSandbox();
    $$.setConfigStubContents('AuthInfoConfig', {
      contents: await testData.getConfig(),
    });
    // Stub retrieveMaxApiVersion to get over "Domain Not Found: The org cannot be found" error
    sandboxStub
      .stub(Connection.prototype, 'retrieveMaxApiVersion')
      .resolves('50.0');
    mockConnection = await Connection.create({
      authInfo: await AuthInfo.create({
        username: testData.username,
      }),
    });
    sandboxStub.stub(mockConnection, 'instanceUrl').get(() => {
      return 'https://na139.salesforce.com';
    });

    sandboxStub.stub(StreamingClient.prototype, 'handshake').resolves();
    toolingRequestStub = sandboxStub.stub(mockConnection.tooling, 'request');
    queryStub = sandboxStub.stub(
      QueryHelper.instance(mockConnection.tooling),
      'query'
    );
  });

  afterEach(() => {
    sandboxStub.restore();
  });

  it('should create map of class ids to names', async () => {
    const mockApexClasses: ApexClassInfo[] = [
      {
        Id: 'An Id',
        Name: 'FooClass',
        SymbolTable: null,
      },
    ];

    queryStub.resolves(mockApexClasses);

    const testMethodCollector = new OrgTestMethodCollector(
      new CapturingLogger(),
      mockConnection,
      'foo',
      []
    );
    const classNameById = await testMethodCollector.classIdNameMap();

    expect(classNameById.size).to.equal(1);
    expect(classNameById.has('An Id')).to.be.true;
    expect(classNameById.get('An Id')).to.equal('FooClass');
  });

  it('should create map of passed class ids to names', async () => {
    const mockApexClasses: ApexClassInfo[] = [
      {
        Id: 'An Id',
        Name: 'FooClass',
        SymbolTable: null,
      },
      {
        Id: 'Another Id',
        Name: 'BarClass',
        SymbolTable: null,
      },
    ];

    queryStub.resolves(mockApexClasses);

    const testMethodCollector = new OrgTestMethodCollector(
      new CapturingLogger(),
      mockConnection,
      'foo',
      ['FooClass']
    );
    const classNameById = await testMethodCollector.classIdNameMap();

    expect(classNameById.size).to.equal(2);
    expect(classNameById.has('An Id')).to.be.true;
    expect(classNameById.get('An Id')).to.equal('FooClass');
    expect(classNameById.has('Another Id')).to.be.true;
    expect(classNameById.get('Another Id')).to.equal('BarClass');
  });

  it('should create map of passed large class ids to names', async () => {
    const mockApexClasses: ApexClassInfo[] = [];
    for (let i = 0; i < 500; i++) {
      mockApexClasses.push({
        Id: `Id${i}`,
        Name: `Foo${i}`,
        SymbolTable: null,
      });
    }

    queryStub.onCall(0).resolves(mockApexClasses.slice(0, 200));
    queryStub.onCall(1).resolves(mockApexClasses.slice(200, 400));
    queryStub.onCall(2).resolves(mockApexClasses.slice(400));

    const testMethodCollector = new OrgTestMethodCollector(
      new CapturingLogger(),
      mockConnection,
      'foo',
      mockApexClasses.map(cls => cls.Name)
    );
    const classNameById = await testMethodCollector.classIdNameMap();

    expect(classNameById.size).to.equal(500);
    expect(classNameById.has('Id0')).to.be.true;
    expect(classNameById.get('Id0')).to.equal('Foo0');
    expect(classNameById.has('Id499')).to.be.true;
    expect(classNameById.get('Id499')).to.equal('Foo499');
  });

  it('should collect test methods from REST query', async () => {
    const mockApexClasses: ApexClassInfo[] = [
      {
        Id: 'Id1',
        Name: 'FooClass',
        SymbolTable: {
          tableDeclaration: {
            modifiers: ['testMethod'],
          },
          methods: [
            {
              modifiers: ['testMethod'],
              name: 'FooMethod1',
            },
            {
              modifiers: [],
              name: 'FooMethod2',
            },
            {
              modifiers: ['testMethod'],
              name: 'FooMethod3',
            },
          ],
        },
      },
      {
        Id: 'Id2',
        Name: 'BarClass',
        SymbolTable: {
          tableDeclaration: {
            modifiers: [],
          },
        },
      },
      {
        Id: 'Id3',
        Name: 'BazClass',
        SymbolTable: {
          tableDeclaration: {
            modifiers: ['testMethod'],
          },
          methods: [
            {
              modifiers: ['testMethod'],
              name: 'BazMethod',
            },
          ],
        },
      },
    ];

    // Use same response for both types of ApexClass query
    queryStub.resolves(mockApexClasses);

    const testMethodCollector = new OrgTestMethodCollector(
      new CapturingLogger(),
      mockConnection,
      'foo',
      []
    );
    const testMethodsByClassName = await testMethodCollector.gatherTestMethods(
      () => false
    );

    expect(testMethodsByClassName.size).to.equal(2);
    expect(testMethodsByClassName.has('FooClass')).to.be.true;
    expect(testMethodsByClassName.get('FooClass')?.size).to.equal(2);
    expect(testMethodsByClassName.get('FooClass')?.has('FooMethod1')).to.be
      .true;
    expect(testMethodsByClassName.get('FooClass')?.has('FooMethod3')).to.be
      .true;
    expect(testMethodsByClassName.has('BazClass')).to.be.true;
    expect(testMethodsByClassName.get('BazClass')?.size).to.equal(1);
    expect(testMethodsByClassName.get('BazClass')?.has('BazMethod')).to.be.true;
  });

  it('should collect test methods from SOAP query', async () => {
    const mockApexClasses: ApexClassInfo[] = [
      {
        Id: 'Id1',
        Name: 'FooClass',
        SymbolTable: null,
      },
      {
        Id: 'Id2',
        Name: 'BarClass',
        SymbolTable: {
          tableDeclaration: {
            modifiers: [],
          },
        },
      },
      {
        Id: 'Id3',
        Name: 'BazClass',
        SymbolTable: {
          tableDeclaration: {
            modifiers: ['testMethod'],
          },
          methods: [
            {
              modifiers: ['testMethod'],
              name: 'BazMethod',
            },
          ],
        },
      },
    ];
    // classIdNameMap calls
    queryStub
      .withArgs('ApexClass', match.any, 'Id, Name')
      .resolves(mockApexClasses);

    // ClassSymbolLoader calls
    queryStub
      .withArgs('ApexClass', match.any, 'Id, Name, SymbolTable')
      .onCall(0)
      .resolves(mockApexClasses);

    const updatedApexClasses: ApexClassInfo[] = [
      {
        Id: 'Id1',
        Name: 'FooClass',
        SymbolTable: {
          tableDeclaration: {
            modifiers: ['testMethod'],
          },
          methods: [
            {
              modifiers: ['testMethod'],
              name: 'FooMethod1',
            },
            {
              modifiers: [],
              name: 'FooMethod2',
            },
            {
              modifiers: ['testMethod'],
              name: 'FooMethod3',
            },
          ],
        },
      },
    ];
    queryStub
      .withArgs('ApexClass', match.any, 'Id, Name, SymbolTable')
      .onCall(1)
      .resolves(updatedApexClasses);
    setupQueryApexClassesSOAP(toolingRequestStub, []);

    const testMethodCollector = new OrgTestMethodCollector(
      new CapturingLogger(),
      mockConnection,
      'foo',
      []
    );
    const testMethodsByClassName = await testMethodCollector.gatherTestMethods(
      () => false
    );

    expect(testMethodsByClassName.size).to.equal(2);
    expect(testMethodsByClassName.has('FooClass')).to.be.true;
    expect(testMethodsByClassName.get('FooClass')?.size).to.equal(2);
    expect(testMethodsByClassName.get('FooClass')?.has('FooMethod1')).to.be
      .true;
    expect(testMethodsByClassName.get('FooClass')?.has('FooMethod3')).to.be
      .true;
    expect(testMethodsByClassName.has('BazClass')).to.be.true;
    expect(testMethodsByClassName.get('BazClass')?.size).to.equal(1);
    expect(testMethodsByClassName.get('BazClass')?.has('BazMethod')).to.be.true;
  });
});
