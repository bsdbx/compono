import type {
  Account,
  CodeRequest,
  Component,
  ComponentContent,
  Evaluated,
  GeneratedCode,
  Graph,
  Health,
  Invite,
  InviteLink,
  ListedComponent,
  ListedProject,
  Member,
  MemberRole,
  NewComponent,
  NewName,
  NewProject,
  NewTeam,
  NodeTypeInfo,
  Project,
  ProjectChanges,
  ProjectMember,
  Saved,
  SignIn,
  SignUp,
  Team,
  TeamChanges,
} from "./types";

/** A same-origin API call. Authentication stays in the HttpOnly session cookie. */
export type ApiError = {
  detail?:
    | string
    | Array<{ loc: Array<string | number>; msg: string; type: string }>;
};
export type ApiResult<T> =
  | { data: T; error?: never }
  | { data?: never; error: ApiError };

type RequestOptions = {
  signal?: AbortSignal;
  throwOnError?: boolean;
  body?: unknown;
};

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions,
): Promise<ApiResult<T>> {
  const request = new Request(new URL(path, window.location.origin), {
    method,
    credentials: "same-origin",
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options.body),
        }),
  });
  const response = await fetch(request);
  const text = await response.text();
  let value: unknown;
  try {
    value = text === "" ? undefined : JSON.parse(text);
  } catch {
    if (response.ok) throw new Error("The API returned invalid JSON.");
  }
  if (!response.ok) {
    const error: ApiError =
      typeof value === "object" && value !== null
        ? value
        : { detail: response.statusText };
    if (options.throwOnError) throw error;
    return { error };
  }
  return { data: value as T };
}

/** Health. */
export const health = (options: RequestOptions = {}) =>
  request<Health>("GET", "/api/health", options);

/** Sign Up. */
export const signUp = (options: RequestOptions & { body: SignUp }) =>
  request<Account>("POST", "/api/accounts", options);

/** Sign In. */
export const signIn = (options: RequestOptions & { body: SignIn }) =>
  request<Account>("POST", "/api/sessions", options);

/** Sign Out Everywhere. */
export const signOutEverywhere = (options: RequestOptions = {}) =>
  request<void>("DELETE", "/api/sessions", options);

/** Sign Out. */
export const signOut = (options: RequestOptions = {}) =>
  request<void>("DELETE", "/api/sessions/current", options);

/** Current Account. */
export const currentAccount = (options: RequestOptions = {}) =>
  request<Account>("GET", "/api/account", options);

/** My Teams. */
export const myTeams = (options: RequestOptions = {}) =>
  request<Array<Team>>("GET", "/api/teams", options);

/** Create Team. */
export const createTeam = (options: RequestOptions & { body: NewTeam }) =>
  request<Team>("POST", "/api/teams", options);

/** Team. */
export const team = (
  options: RequestOptions & { path: { team_url: string } },
) =>
  request<Team>(
    "GET",
    `/api/teams/${encodeURIComponent(options.path.team_url)}`,
    options,
  );

/** Update Team. */
export const updateTeam = (
  options: RequestOptions & { path: { team_url: string }; body: TeamChanges },
) =>
  request<Team>(
    "PATCH",
    `/api/teams/${encodeURIComponent(options.path.team_url)}`,
    options,
  );

/** Delete Team. */
export const deleteTeam = (
  options: RequestOptions & { path: { team_url: string } },
) =>
  request<void>(
    "DELETE",
    `/api/teams/${encodeURIComponent(options.path.team_url)}`,
    options,
  );

/** Team Members. */
export const teamMembers = (
  options: RequestOptions & { path: { team_url: string } },
) =>
  request<Array<Member>>(
    "GET",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/members`,
    options,
  );

/** Make Owner. */
export const makeOwner = (
  options: RequestOptions & { path: { team_url: string; account_id: string } },
) =>
  request<Member>(
    "PUT",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/owners/${encodeURIComponent(options.path.account_id)}`,
    options,
  );

/** Remove Member. */
export const removeMember = (
  options: RequestOptions & { path: { team_url: string; account_id: string } },
) =>
  request<void>(
    "DELETE",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/members/${encodeURIComponent(options.path.account_id)}`,
    options,
  );

/** Leave Team. */
export const leaveTeam = (
  options: RequestOptions & { path: { team_url: string } },
) =>
  request<void>(
    "DELETE",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/membership`,
    options,
  );

/** Invite Link. */
export const inviteLink = (
  options: RequestOptions & { path: { team_url: string } },
) =>
  request<InviteLink>(
    "GET",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/invite-link`,
    options,
  );

/** Invite. */
export const invite = (options: RequestOptions & { path: { token: string } }) =>
  request<Invite>(
    "GET",
    `/api/invite-links/${encodeURIComponent(options.path.token)}`,
    options,
  );

/** Join Team. */
export const joinTeam = (
  options: RequestOptions & { path: { token: string } },
) =>
  request<Team>(
    "POST",
    `/api/invite-links/${encodeURIComponent(options.path.token)}`,
    options,
  );

/** Team Projects. */
export const teamProjects = (
  options: RequestOptions & { path: { team_url: string } },
) =>
  request<Array<ListedProject>>(
    "GET",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/projects`,
    options,
  );

/** Create Project. */
export const createProject = (
  options: RequestOptions & { path: { team_url: string }; body: NewProject },
) =>
  request<Project>(
    "POST",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/projects`,
    options,
  );

/** Project. */
export const project = (
  options: RequestOptions & { path: { team_url: string; project_url: string } },
) =>
  request<Project>(
    "GET",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/projects/${encodeURIComponent(options.path.project_url)}`,
    options,
  );

/** Update Project. */
export const updateProject = (
  options: RequestOptions & {
    path: { team_url: string; project_url: string };
    body: ProjectChanges;
  },
) =>
  request<Project>(
    "PATCH",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/projects/${encodeURIComponent(options.path.project_url)}`,
    options,
  );

/** Delete Project. */
export const deleteProject = (
  options: RequestOptions & { path: { team_url: string; project_url: string } },
) =>
  request<void>(
    "DELETE",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/projects/${encodeURIComponent(options.path.project_url)}`,
    options,
  );

/** Project Members. */
export const projectMembers = (
  options: RequestOptions & { path: { team_url: string; project_url: string } },
) =>
  request<Array<ProjectMember>>(
    "GET",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/projects/${encodeURIComponent(options.path.project_url)}/members`,
    options,
  );

/** Set Project Member. */
export const setProjectMember = (
  options: RequestOptions & {
    path: { team_url: string; project_url: string; account_id: string };
    body: MemberRole;
  },
) =>
  request<ProjectMember>(
    "PUT",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/projects/${encodeURIComponent(options.path.project_url)}/members/${encodeURIComponent(options.path.account_id)}`,
    options,
  );

/** Remove Project Member. */
export const removeProjectMember = (
  options: RequestOptions & {
    path: { team_url: string; project_url: string; account_id: string };
  },
) =>
  request<void>(
    "DELETE",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/projects/${encodeURIComponent(options.path.project_url)}/members/${encodeURIComponent(options.path.account_id)}`,
    options,
  );

/** Leave Project. */
export const leaveProject = (
  options: RequestOptions & { path: { team_url: string; project_url: string } },
) =>
  request<void>(
    "DELETE",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/projects/${encodeURIComponent(options.path.project_url)}/membership`,
    options,
  );

/** Project Components. */
export const projectComponents = (
  options: RequestOptions & { path: { team_url: string; project_url: string } },
) =>
  request<Array<ListedComponent>>(
    "GET",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/projects/${encodeURIComponent(options.path.project_url)}/components`,
    options,
  );

/** Create Component. */
export const createComponent = (
  options: RequestOptions & {
    path: { team_url: string; project_url: string };
    body: NewComponent;
  },
) =>
  request<Component>(
    "POST",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/projects/${encodeURIComponent(options.path.project_url)}/components`,
    options,
  );

/** Component. */
export const component = (
  options: RequestOptions & {
    path: { team_url: string; project_url: string; component_id: string };
  },
) =>
  request<Component>(
    "GET",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/projects/${encodeURIComponent(options.path.project_url)}/components/${encodeURIComponent(options.path.component_id)}`,
    options,
  );

/** Rename Component. */
export const renameComponent = (
  options: RequestOptions & {
    path: { team_url: string; project_url: string; component_id: string };
    body: NewName;
  },
) =>
  request<ListedComponent>(
    "PATCH",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/projects/${encodeURIComponent(options.path.project_url)}/components/${encodeURIComponent(options.path.component_id)}`,
    options,
  );

/** Delete Component. */
export const deleteComponent = (
  options: RequestOptions & {
    path: { team_url: string; project_url: string; component_id: string };
  },
) =>
  request<void>(
    "DELETE",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/projects/${encodeURIComponent(options.path.project_url)}/components/${encodeURIComponent(options.path.component_id)}`,
    options,
  );

/** Save Component. */
export const saveComponent = (
  options: RequestOptions & {
    path: { team_url: string; project_url: string; component_id: string };
    body: ComponentContent;
  },
) =>
  request<Saved>(
    "PUT",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/projects/${encodeURIComponent(options.path.project_url)}/components/${encodeURIComponent(options.path.component_id)}/content`,
    options,
  );

/** Duplicate Component. */
export const duplicateComponent = (
  options: RequestOptions & {
    path: { team_url: string; project_url: string; component_id: string };
  },
) =>
  request<Component>(
    "POST",
    `/api/teams/${encodeURIComponent(options.path.team_url)}/projects/${encodeURIComponent(options.path.project_url)}/components/${encodeURIComponent(options.path.component_id)}/copies`,
    options,
  );

/** List Node Types. */
export const listNodeTypes = (options: RequestOptions = {}) =>
  request<Array<NodeTypeInfo>>("GET", "/api/node-types", options);

/** Evaluate Graph. */
export const evaluateGraph = (options: RequestOptions & { body: Graph }) =>
  request<Evaluated>("POST", "/api/evaluate", options);

/** Generate Code. */
export const generateCode = (options: RequestOptions & { body: CodeRequest }) =>
  request<GeneratedCode>("POST", "/api/code", options);
