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
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { QueryHelper } from '../../src/query/QueryHelper';
import { ApexClassInfo } from '../../src/query/ClassSymbolLoader';
import { OrgTestMethodCollector } from '../../src/collector/OrgTestMethodCollector';
import { TestItemTestMethodCollector } from '../../src/collector/TestItemTestMethodCollector';
import { TestItem } from '@salesforce/apex-node';

const $$ = testSetup();
let mockConnection: Connection;
let sandboxStub: SinonSandbox;
let toolingQueryStub: SinonStub;
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

    const testMethodCollector = new TestItemTestMethodCollector(
      new CapturingLogger(mockConnection, false),
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

    queryHelperStub.resolves(mockApexClasses);
    toolingQueryStub.resolves({ records: mockApexClasses });

    const testMethodCollector = new OrgTestMethodCollector(
      new CapturingLogger(mockConnection, false),
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

    queryHelperStub.onCall(0).resolves(mockApexClasses.slice(0, 200));
    queryHelperStub.onCall(1).resolves(mockApexClasses.slice(200, 400));
    queryHelperStub.onCall(2).resolves(mockApexClasses.slice(400));

    const testMethodCollector = new TestItemTestMethodCollector(
      new CapturingLogger(mockConnection, false),
      mockConnection,
      'foo',
      mockApexClasses.map(cls => {
        return {
          className: cls.Name,
        };
      })
    );
    const classNameById = await testMethodCollector.classIdNameMap();

    expect(classNameById.size).to.equal(500);
    expect(classNameById.has('Id0')).to.be.true;
    expect(classNameById.get('Id0')).to.equal('Foo0');
    expect(classNameById.has('Id499')).to.be.true;
    expect(classNameById.get('Id499')).to.equal('Foo499');
  });

  it('should collect test methods from TestItems', async () => {
    const mockTestItems: TestItem[] = [
      {
        className: 'FooClass',
        testMethods: ['FooMethod1'],
      },
      {
        className: 'FooClass',
        testMethods: ['FooMethod3'],
      },
      {
        className: 'BazClass',
        testMethods: ['BazMethod'],
      },
    ];

    const testMethodCollector = new TestItemTestMethodCollector(
      new CapturingLogger(mockConnection, false),
      mockConnection,
      'foo',
      mockTestItems
    );
    const testMethodsByClassName = await testMethodCollector.gatherTestMethods();

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
