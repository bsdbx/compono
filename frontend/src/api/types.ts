/** Data exchanged with FastAPI. Keep these shapes aligned with its Pydantic models. */
export type Account = {
  id: string;
  name: string;
  email: string;
};

export type AnyType = {
  kind?: "any";
};

export type BooleanType = {
  kind?: "boolean";
};

export type ChoiceType = {
  kind?: "choice";
  options: Array<string>;
};

export type CodeRequest = {
  name: string;
  graph: Graph;
};

export type Component = {
  id: string;
  name: string;
  graph: {
    [key: string]: unknown;
  };
  screen_sizes: Array<ScreenSize>;
  version: number;
  updated_at: string;
};

export type ComponentContent = {
  version: number;
  graph: {
    [key: string]: unknown;
  };
  screen_sizes: Array<ScreenSize>;
};

export type ComponentNotFoundError = {
  detail: "team_not_found" | "project_not_found" | "component_not_found";
};

export type DateType = {
  kind?: "date";
};

export type ElementType = {
  kind?: "element";
};

export type EmailTakenError = {
  detail: "email_taken";
};

export type End = {
  node: string;
  socket: string;
};

export type Evaluated = {
  nodes: {
    [key: string]: EvaluatedNode;
  };
  wires: {
    [key: string]: string;
  };
  rendered: JsonValue;
  milliseconds: number;
};

export type EvaluatedNode = {
  sockets: NodeSockets;
  outputs: {
    [key: string]: JsonValue;
  };
  error: string | null;
  skipped: boolean;
};

export type GeneratedCode = {
  filename: string;
  code: string | null;
  errors: Array<string>;
};

export type Graph = {
  format?: 1;
  props?: Array<Prop>;
  nodes?: Array<Node>;
  wires?: Array<Wire>;
};

export type GroupSocket = {
  id: string;
  label: string;
  type: SocketTypeOutput;
  before: string | null;
};

export type HttpValidationError = {
  detail?: Array<ValidationError>;
};

export type Health = {
  status: string;
};

export type InputSocket = {
  id: string;
  label: string;
  type: SocketTypeOutput;
  default: JsonValue;
};

export type Invite = {
  team_name: string;
};

export type InviteLink = {
  token: string;
  expires_at: string;
};

export type InviteLinkNotValidError = {
  detail: "invite_link_not_valid";
};

export type JsonValue = unknown;

export type LastLeadError = {
  detail: "last_lead";
};

export type LeadCannotBeChangedError = {
  detail: "lead_cannot_be_changed";
};

export type LastOwnerError = {
  detail: "last_owner";
};

export type LeadsOnlyError = {
  detail: "leads_only";
};

export type ListedComponent = {
  id: string;
  name: string;
  updated_at: string;
};

export type ListedProject = {
  id: string;
  name: string;
  url: string;
  description: string;
  edited_at: string;
  role: ProjectRole | null;
  members: Array<MemberName>;
};

export type Member = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
};

export type MemberName = {
  id: string;
  name: string;
};

export type MemberNotFoundError = {
  detail: "team_not_found" | "member_not_found";
};

export type MemberRole = {
  role: ProjectRole;
};

export type NameTakenError = {
  detail: "name_taken";
};

export type NewComponent = {
  name?: string | null;
  width?: number | null;
};

export type NewName = {
  name: string;
};

export type NewProject = {
  name: string;
  description?: string;
};

export type NewTeam = {
  name: string;
  url: string;
};

export type Node = {
  id: string;
  type: string;
  name?: string | null;
  collapsed?: boolean;
  position?: Position;
  values?: {
    [key: string]: JsonValue;
  };
  properties?: {
    [key: string]: JsonValue;
  };
  exposed?: Array<string>;
  groups?: {
    [key: string]: Array<string>;
  };
};

export type NodeProperty = {
  id: string;
  label: string;
  type: SocketTypeOutput;
  default: JsonValue;
  on_node: boolean;
};

export type NodeSockets = {
  inputs: Array<InputSocket>;
  groups: Array<GroupSocket>;
  outputs: Array<OutputSocket>;
};

export type NodeTypeInfo = {
  type: string;
  name: string;
  category: string;
  single: boolean;
  properties: Array<NodeProperty>;
  sockets: NodeSockets;
};

export type NotSignedInError = {
  detail: Reason;
};

export type NothingType = {
  kind?: "nothing";
};

export type NumberType = {
  kind?: "number";
  integer?: boolean;
  minimum?: number | null;
  maximum?: number | null;
  step?: number | null;
};

export type ObjectTypeInput = {
  kind?: "object";
  fields: {
    [key: string]: SocketTypeInput;
  };
};

export type ObjectTypeOutput = {
  kind?: "object";
  fields: {
    [key: string]: SocketTypeOutput;
  };
};

export type OutputSocket = {
  id: string;
  label: string;
  type: SocketTypeOutput;
};

export type OwnerCannotBeRemovedError = {
  detail: "owner_cannot_be_removed";
};

export type OwnersOnlyError = {
  detail: "owners_only";
};

export type Position = {
  x?: number;
  y?: number;
};

export type Project = {
  id: string;
  name: string;
  url: string;
  description: string;
  edited_at: string;
  role: ProjectRole | null;
};

export type ProjectChanges = {
  name?: string | null;
  description?: string | null;
};

export type ProjectMember = {
  id: string;
  name: string;
  email: string;
  role: ProjectRole;
};

export type ProjectMemberNotFoundError = {
  detail: "team_not_found" | "project_not_found" | "member_not_found";
};

export type ProjectNotFoundError = {
  detail: "team_not_found" | "project_not_found";
};

export type ProjectRole = "LEAD" | "DEVELOPER";

export type Prop = {
  id: string;
  name: string;
  type: SocketTypeInput;
  required?: boolean;
  default?: JsonValue;
  description?: string;
};

export type Reason = "no_session" | "signed_out" | "expired";

export type Saved = {
  version: number;
  updated_at: string;
};

export type ScreenSize = {
  name: string;
  width: number;
  height?: number;
};

export type SignIn = {
  email: string;
  password: string;
};

export type SignUp = {
  name: string;
  email: string;
  password: string;
};

export type SlotType = {
  kind?: "slot";
};

export type SocketTypeInput =
  | BooleanType
  | NumberType
  | TextType
  | ChoiceType
  | ObjectTypeInput
  | DateType
  | ElementType
  | SlotType
  | NothingType
  | AnyType;

export type SocketTypeOutput =
  | BooleanType
  | NumberType
  | TextType
  | ChoiceType
  | ObjectTypeOutput
  | DateType
  | ElementType
  | SlotType
  | NothingType
  | AnyType;

export type Team = {
  id: string;
  name: string;
  url: string;
  role: TeamRole;
};

export type TeamChanges = {
  name?: string | null;
  url?: string | null;
};

export type TeamNotFoundError = {
  detail: "team_not_found";
};

export type TeamRole = "OWNER" | "MEMBER";

export type TextType = {
  kind?: "text";
  link?: boolean;
};

export type UrlTakenError = {
  detail: "url_taken";
};

export type ValidationError = {
  loc: Array<string | number>;
  msg: string;
  type: string;
  input?: unknown;
  ctx?: {
    [key: string]: unknown;
  };
};

export type VersionConflictError = {
  detail: "version_conflict";
};

export type Wire = {
  id: string;
  from: End;
  to: End;
};

export type WrongEmailOrPasswordError = {
  detail: "wrong_email_or_password";
};
