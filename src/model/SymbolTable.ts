/*
 * Copyright (c) 2023, Certinia Inc. All rights reserved.
 */

// Types derived from documentation and Tooling API WSDL
// https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_symboltable.htm

export interface SymbolTable {
  constructors: Constructor[];
  externalReferences: ExternalReference[];
  id: string;
  innerClasses: SymbolTable[];
  interfaces: string[];
  methods: Method[];
  name: string;
  namespace: string;
  parentClass: string;
  properties: VisibilitySymbol[];
  tableDeclaration: ApexSymbol;
  variables: ApexSymbol[];
}

interface Constructor extends VisibilitySymbol {
  parameters: Parameter[];
}

interface VisibilitySymbol extends ApexSymbol {
  visibility: string;
}

interface ApexSymbol {
  annotations: Annotation[];
  location: Position;
  modifiers: string[];
  name: string;
  references: Position[];
  type: string;
}

interface Annotation {
  name: string;
}

interface Position {
  column: number;
  line: number;
}

interface Parameter {
  name: string;
  type: string;
}

interface Method extends Constructor {
  returnType: string;
}

interface ExternalReference {
  methods: ExternalMethod[];
  name: string;
  namespace: string;
  references: Position[];
  variables: ExternalSymbol[];
}

interface ExternalMethod extends ExternalConstructor {
  argTypes: string[];
  isStatic: boolean;
  returnType: string;
}

interface ExternalConstructor extends ExternalSymbol {
  methodDoc: string;
  parameters: Parameter[];
}

interface ExternalSymbol {
  name: string;
  references: Position[];
}
