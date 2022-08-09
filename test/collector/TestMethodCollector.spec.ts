/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */
import { AuthInfo, Connection } from '@apexdevtools/sfdx-auth-helper';
import {
  MockTestOrgData,
  testSetup,
} from '@apexdevtools/sfdx-auth-helper/lib/src/testSetup';
import { StreamingClient } from '@salesforce/apex-node/lib/src/streaming';
import { createSandbox, SinonSandbox, SinonStub } from 'sinon';
import { expect } from 'chai';
import { OrgTestMethodCollector } from '../../src/collector/TestMethodCollector';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { QueryHelper } from '../../src/query/QueryHelper';
import { ApexClassInfo } from '../../src/query/ClassSymbolLoader';
import { setupQueryApexClassesSOAP } from '../Setup';

const $$ = testSetup();
let mockConnection: Connection;
let sandboxStub: SinonSandbox;
let toolingQueryStub: SinonStub;
let toolingRequestStub: SinonStub;
let queryHelperStub: SinonStub;
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
    toolingQueryStub = sandboxStub.stub(mockConnection.tooling, 'query');
    toolingRequestStub = sandboxStub.stub(mockConnection.tooling, 'request');
    queryHelperStub = sandboxStub.stub(
      QueryHelper.instance(mockConnection),
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

    queryHelperStub.resolves(mockApexClasses);

    const testMethodCollector = new OrgTestMethodCollector(
      new CapturingLogger(mockConnection, false),
      mockConnection,
      'foo',
      []
    );
    const classNameById = await testMethodCollector.classIdNameMap();

    expect(classNameById.size === 1);
    expect(classNameById.has('An Id'));
    expect(classNameById.get('An Id') === 'FooClass');
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

    queryHelperStub.resolves(mockApexClasses);
    toolingQueryStub.resolves({ records: mockApexClasses });

    const testMethodCollector = new OrgTestMethodCollector(
      new CapturingLogger(mockConnection, false),
      mockConnection,
      'foo',
      ['FooClass']
    );
    const classNameById = await testMethodCollector.classIdNameMap();

    expect(classNameById.size === 1);
    expect(classNameById.has('An Id'));
    expect(classNameById.get('An Id') === 'FooClass');
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

    queryHelperStub.onCall(0).resolves(mockApexClasses.slice(0, 200));
    queryHelperStub.onCall(1).resolves(mockApexClasses.slice(200, 400));
    queryHelperStub.onCall(2).resolves(mockApexClasses.slice(400));

    const testMethodCollector = new OrgTestMethodCollector(
      new CapturingLogger(mockConnection, false),
      mockConnection,
      'foo',
      mockApexClasses.map(cls => cls.Name)
    );
    const classNameById = await testMethodCollector.classIdNameMap();

    expect(classNameById.size === 500);
    expect(classNameById.has('Id0'));
    expect(classNameById.get('Id0') === 'Foo0');
    expect(classNameById.has('Id499'));
    expect(classNameById.get('Id499') === 'Foo499');
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

    queryHelperStub.resolves(mockApexClasses);
    toolingQueryStub.resolves({ records: mockApexClasses });

    const testMethodCollector = new OrgTestMethodCollector(
      new CapturingLogger(mockConnection, false),
      mockConnection,
      'foo',
      []
    );
    const testMethodsByClassName = await testMethodCollector.gatherTestMethods();

    expect(testMethodsByClassName.size === 2);
    expect(testMethodsByClassName.has('FooClass'));
    expect(testMethodsByClassName.get('FooClass')?.size == 2);
    expect(testMethodsByClassName.get('FooClass')?.has('FooMethod1'));
    expect(testMethodsByClassName.get('FooClass')?.has('FooMethod3'));
    expect(testMethodsByClassName.has('BazClass'));
    expect(testMethodsByClassName.get('BazClass')?.size == 1);
    expect(testMethodsByClassName.get('BazClass')?.has('BazMethod'));
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
    queryHelperStub.resolves(mockApexClasses);
    toolingQueryStub.resolves({ records: mockApexClasses });

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
    setupQueryApexClassesSOAP(toolingRequestStub, updatedApexClasses);

    const testMethodCollector = new OrgTestMethodCollector(
      new CapturingLogger(mockConnection, false),
      mockConnection,
      'foo',
      []
    );
    const testMethodsByClassName = await testMethodCollector.gatherTestMethods();

    expect(testMethodsByClassName.size === 2);
    expect(testMethodsByClassName.has('FooClass'));
    expect(testMethodsByClassName.get('FooClass')?.size == 2);
    expect(testMethodsByClassName.get('FooClass')?.has('FooMethod1'));
    expect(testMethodsByClassName.get('FooClass')?.has('FooMethod3'));
    expect(testMethodsByClassName.has('BazClass'));
    expect(testMethodsByClassName.get('BazClass')?.size == 1);
    expect(testMethodsByClassName.get('BazClass')?.has('BazMethod'));
  });
});
