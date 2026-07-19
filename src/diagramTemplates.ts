export type TemplateFieldKind = 'identifier' | 'number' | 'select' | 'text';

export interface TemplateFieldOption {
  label: string;
  value: string;
}

export interface DiagramTemplateField {
  defaultValue: string;
  id: string;
  kind: TemplateFieldKind;
  label: string;
  maximum?: number;
  minimum?: number;
  options?: TemplateFieldOption[];
  placeholder?: string;
}

export interface DiagramTemplate {
  category: string;
  description: string;
  fields: DiagramTemplateField[];
  fileName: string;
  id: string;
  source: string;
  title: string;
}

export interface DiagramExample {
  category: string;
  fileName: string;
  id: string;
  source: string;
  title: string;
}

export const DIAGRAM_TEMPLATES: DiagramTemplate[] = [
  {
    category: 'Flow',
    description: 'A clear three-step process with editable labels and direction.',
    fields: [
      selectField('direction', 'Direction', 'LR', [
        ['Left to right', 'LR'],
        ['Top to bottom', 'TD'],
      ]),
      textField('start', 'Start', 'Request received'),
      textField('process', 'Process', 'Review request'),
      textField('finish', 'Result', 'Request approved'),
    ],
    fileName: 'process-flow.mmd',
    id: 'process-flow',
    source: `flowchart {{direction}}
  start(["{{start}}"])
  process["{{process}}"]
  finish(["{{finish}}"])

  start --> process --> finish`,
    title: 'Process flow',
  },
  {
    category: 'UML',
    description: 'A request and response exchange between two participants.',
    fields: [
      identifierField('actorOneId', 'First participant ID', 'client'),
      textField('actorOne', 'First participant', 'Client'),
      identifierField('actorTwoId', 'Second participant ID', 'service'),
      textField('actorTwo', 'Second participant', 'Service'),
      textField('request', 'Request message', 'Submit request'),
      textField('response', 'Response message', 'Return result'),
    ],
    fileName: 'service-sequence.mmd',
    id: 'service-sequence',
    source: `sequenceDiagram
  participant {{actorOneId}} as {{actorOne}}
  participant {{actorTwoId}} as {{actorTwo}}
  {{actorOneId}}->>{{actorTwoId}}: {{request}}
  activate {{actorTwoId}}
  {{actorTwoId}}-->>{{actorOneId}}: {{response}}
  deactivate {{actorTwoId}}`,
    title: 'Service sequence',
  },
  {
    category: 'UML',
    description: 'Two classes with attributes, operations, and a configurable relationship.',
    fields: [
      identifierField('firstClass', 'First class', 'Customer'),
      identifierField('secondClass', 'Second class', 'Order'),
      textField('relation', 'Relationship label', 'places'),
    ],
    fileName: 'domain-classes.mmd',
    id: 'domain-classes',
    source: `classDiagram
  class {{firstClass}} {
    +String id
    +create()
  }
  class {{secondClass}} {
    +String id
    +confirm()
  }
  {{firstClass}} "1" --> "many" {{secondClass}} : {{relation}}`,
    title: 'Domain classes',
  },
  {
    category: 'Data',
    description: 'A parent/child data model ready for domain-specific entity names.',
    fields: [
      identifierField('parent', 'Parent entity', 'CUSTOMER'),
      identifierField('child', 'Child entity', 'ORDER'),
      textField('relation', 'Relationship', 'places'),
    ],
    fileName: 'data-model.mmd',
    id: 'data-model',
    source: `erDiagram
  {{parent}} ||--o{ {{child}} : "{{relation}}"
  {{parent}} {
    string id PK
    string name
  }
  {{child}} {
    string id PK
    string parent_id FK
    string status
  }`,
    title: 'Entity relationship',
  },
  {
    category: 'Planning',
    description: 'A lightweight project schedule with configurable duration.',
    fields: [
      textField('title', 'Project title', 'Delivery plan'),
      textField('firstTask', 'First task', 'Discovery'),
      textField('secondTask', 'Second task', 'Implementation'),
      numberField('duration', 'Implementation days', '5', 1, 90),
    ],
    fileName: 'delivery-plan.mmd',
    id: 'delivery-plan',
    source: `gantt
  title {{title}}
  dateFormat YYYY-MM-DD
  axisFormat %d %b
  section Project
  {{firstTask}} :done, discovery, 2026-01-05, 3d
  {{secondTask}} :active, implementation, after discovery, {{duration}}d`,
    title: 'Delivery plan',
  },
  {
    category: 'Planning',
    description: 'A customer journey with two editable stages and satisfaction scores.',
    fields: [
      textField('title', 'Journey title', 'Customer onboarding'),
      textField('firstStage', 'First stage', 'Create account'),
      numberField('firstScore', 'First score', '4', 1, 5),
      textField('secondStage', 'Second stage', 'Complete profile'),
      numberField('secondScore', 'Second score', '3', 1, 5),
    ],
    fileName: 'customer-journey.mmd',
    id: 'customer-journey',
    source: `journey
  title {{title}}
  section Onboarding
    {{firstStage}}: {{firstScore}}: Customer
    {{secondStage}}: {{secondScore}}: Customer`,
    title: 'Customer journey',
  },
  {
    category: 'Ideas',
    description: 'A compact mind map for a topic and three supporting branches.',
    fields: [
      textField('topic', 'Central topic', 'Product idea'),
      textField('branchOne', 'First branch', 'Audience'),
      textField('branchTwo', 'Second branch', 'Value'),
      textField('branchThree', 'Third branch', 'Delivery'),
    ],
    fileName: 'idea-map.mmd',
    id: 'idea-map',
    source: `mindmap
  root(({{topic}}))
    {{branchOne}}
    {{branchTwo}}
    {{branchThree}}`,
    title: 'Idea map',
  },
  {
    category: 'Architecture',
    description: 'A small system landscape connecting a client, API, and database.',
    fields: [
      textField('client', 'Client label', 'Web application'),
      textField('service', 'Service label', 'Application API'),
      textField('database', 'Database label', 'Primary database'),
    ],
    fileName: 'system-landscape.mmd',
    id: 'system-landscape',
    source: `architecture-beta
  group platform(cloud)[Platform]

  service client(internet)[{{client}}]
  service api(server)[{{service}}] in platform
  service db(database)[{{database}}] in platform

  client:R --> L:api
  api:R --> L:db`,
    title: 'System landscape',
  },
];

export function renderDiagramTemplate(
  template: DiagramTemplate,
  values: Record<string, unknown> = {},
): string {
  const normalized = Object.fromEntries(
    template.fields.map((field) => [
      field.id,
      normalizeTemplateValue(field, values[field.id] ?? field.defaultValue),
    ]),
  );
  return template.source.replace(/\{\{([a-zA-Z][\w]*)\}\}/gu, (match, id: string) =>
    id in normalized ? String(normalized[id]) : match,
  );
}

export function defaultTemplateValues(template: DiagramTemplate): Record<string, string> {
  return Object.fromEntries(template.fields.map((field) => [field.id, field.defaultValue]));
}

export function inferDiagramCategory(source: string): string {
  const declaration = source
    .replace(/^---[\s\S]*?---\s*/u, '')
    .match(/^\s*([\w-]+)/u)?.[1]?.toLowerCase();
  if (!declaration) return 'Other';
  if (['flowchart', 'graph', 'block-beta'].includes(declaration)) return 'Flow';
  if (['sequencediagram', 'classdiagram', 'statediagram-v2'].includes(declaration)) return 'UML';
  if (['erdiagram', 'packet-beta', 'xychart-beta', 'pie'].includes(declaration)) return 'Data';
  if (['gantt', 'journey', 'timeline', 'kanban'].includes(declaration)) return 'Planning';
  if (['architecture-beta', 'c4context', 'c4container', 'c4component'].includes(declaration)) {
    return 'Architecture';
  }
  if (['mindmap', 'treemap-beta'].includes(declaration)) return 'Ideas';
  return 'Other';
}

export function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.(?:mmd|mermaid)$/iu, '')
    .replace(/^\d+[-_]?/u, '')
    .split(/[-_]+/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function normalizeTemplateValue(field: DiagramTemplateField, value: unknown): string {
  const text = (typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : field.defaultValue).trim();
  if (field.kind === 'identifier') {
    const normalized = text.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^[-\d]+/u, '');
    return normalized || field.defaultValue;
  }
  if (field.kind === 'number') {
    const number = Number(text);
    const minimum = field.minimum ?? Number.MIN_SAFE_INTEGER;
    const maximum = field.maximum ?? Number.MAX_SAFE_INTEGER;
    return String(Math.min(Math.max(Number.isFinite(number) ? Math.round(number) : Number(field.defaultValue), minimum), maximum));
  }
  if (field.kind === 'select') {
    return field.options?.some((option) => option.value === text) ? text : field.defaultValue;
  }
  return (text || field.defaultValue)
    .replace(/[\r\n]+/gu, ' ')
    .replaceAll('"', '&quot;')
    .slice(0, 160);
}

function textField(id: string, label: string, defaultValue: string): DiagramTemplateField {
  return { defaultValue, id, kind: 'text', label };
}

function identifierField(id: string, label: string, defaultValue: string): DiagramTemplateField {
  return { defaultValue, id, kind: 'identifier', label };
}

function numberField(
  id: string,
  label: string,
  defaultValue: string,
  minimum: number,
  maximum: number,
): DiagramTemplateField {
  return { defaultValue, id, kind: 'number', label, maximum, minimum };
}

function selectField(
  id: string,
  label: string,
  defaultValue: string,
  entries: Array<[string, string]>,
): DiagramTemplateField {
  return {
    defaultValue,
    id,
    kind: 'select',
    label,
    options: entries.map(([labelText, value]) => ({ label: labelText, value })),
  };
}
