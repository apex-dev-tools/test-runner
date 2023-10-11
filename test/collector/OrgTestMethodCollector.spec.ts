/*
 * Copyright (c) 2022, FinancialForce.com, inc. All rights reserved.
 */

import { Connection } from '@salesforce/core';
import { TestContext } from '@salesforce/core/lib/testSetup';
import { expect } from 'chai';
import {
  SinonSandbox,
  SinonStub,
  SinonStubbedInstance,
  createSandbox,
  match,
} from 'sinon';
import { OrgTestMethodCollector } from '../../src/collector/OrgTestMethodCollector';
import { CapturingLogger } from '../../src/log/CapturingLogger';
import { SymbolTable } from '../../src/model/SymbolTable';
import { ApexClassInfo } from '../../src/query/ClassSymbolLoader';
import { QueryHelper } from '../../src/query/QueryHelper';
import {
  createMockConnection,
  setupQueryApexClassesSOAP,
  createQueryHelper,
} from '../Setup';

describe('OrgTestMethodCollector', () => {
  const $$ = new TestContext();
  let sandbox: SinonSandbox;

  let mockConnection: Connection;
  let requestStub: SinonStub;
  let qhStub: SinonStubbedInstance<QueryHelper>;

  beforeEach(async () => {
    sandbox = createSandbox();
    mockConnection = await createMockConnection($$, sandbox);
    requestStub = sandbox.stub(mockConnection.tooling, 'request');
    qhStub = createQueryHelper(sandbox, mockConnection);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should create map of class ids to names', async () => {
    const mockApexClasses: ApexClassInfo[] = [
      {
        Id: 'An Id',
        Name: 'FooClass',
        SymbolTable: null,
      },
    ];

    qhStub.query.resolves(mockApexClasses);

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

    qhStub.query.resolves(mockApexClasses);

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

    qhStub.query.onCall(0).resolves(mockApexClasses.slice(0, 200));
    qhStub.query.onCall(1).resolves(mockApexClasses.slice(200, 400));
    qhStub.query.onCall(2).resolves(mockApexClasses.slice(400));

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
        } as SymbolTable,
      },
      {
        Id: 'Id2',
        Name: 'BarClass',
        SymbolTable: {
          tableDeclaration: {
            modifiers: [] as string[],
          },
        } as SymbolTable,
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
        } as SymbolTable,
      },
    ];

    // Use same response for both types of ApexClass query
    qhStub.query.resolves(mockApexClasses);

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
            modifiers: [] as string[],
          },
        } as SymbolTable,
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
        } as SymbolTable,
      },
    ];
    // classIdNameMap calls
    qhStub.query
      .withArgs('ApexClass', match.any, 'Id, Name')
      .resolves(mockApexClasses);

    // ClassSymbolLoader calls
    qhStub.query
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
        } as SymbolTable,
      },
    ];
    qhStub.query
      .withArgs('ApexClass', match.any, 'Id, Name, SymbolTable')
      .onCall(1)
      .resolves(updatedApexClasses);
    requestStub.resolves(setupQueryApexClassesSOAP([]));

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
