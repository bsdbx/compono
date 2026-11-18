import { queryOptions, type UseMutationOptions } from "@tanstack/react-query";
import * as api from "./client";

/** Unwrap API responses for the query cache; forms can inspect errors directly. */
async function data<T>(result: Promise<api.ApiResult<T>>): Promise<T> {
  const response = await result;
  if (response.error !== undefined) throw response.error;
  return response.data;
}

export const healthQueryKey = (
  options: Parameters<typeof api.health>[0] = {},
) => ["health", options] as const;
export const healthOptions = (options: Parameters<typeof api.health>[0] = {}) =>
  queryOptions({
    queryKey: healthQueryKey(options),
    queryFn: ({ signal }) => data(api.health({ ...options, signal })),
  });

export const currentAccountQueryKey = (
  options: Parameters<typeof api.currentAccount>[0] = {},
) => ["currentAccount", options] as const;
export const currentAccountOptions = (
  options: Parameters<typeof api.currentAccount>[0] = {},
) =>
  queryOptions({
    queryKey: currentAccountQueryKey(options),
    queryFn: ({ signal }) => data(api.currentAccount({ ...options, signal })),
  });

export const myTeamsQueryKey = (
  options: Parameters<typeof api.myTeams>[0] = {},
) => ["myTeams", options] as const;
export const myTeamsOptions = (
  options: Parameters<typeof api.myTeams>[0] = {},
) =>
  queryOptions({
    queryKey: myTeamsQueryKey(options),
    queryFn: ({ signal }) => data(api.myTeams({ ...options, signal })),
  });

export const teamQueryKey = (options: Parameters<typeof api.team>[0]) =>
  ["team", options] as const;
export const teamOptions = (options: Parameters<typeof api.team>[0]) =>
  queryOptions({
    queryKey: teamQueryKey(options),
    queryFn: ({ signal }) => data(api.team({ ...options, signal })),
  });

export const teamMembersQueryKey = (
  options: Parameters<typeof api.teamMembers>[0],
) => ["teamMembers", options] as const;
export const teamMembersOptions = (
  options: Parameters<typeof api.teamMembers>[0],
) =>
  queryOptions({
    queryKey: teamMembersQueryKey(options),
    queryFn: ({ signal }) => data(api.teamMembers({ ...options, signal })),
  });

export const inviteLinkQueryKey = (
  options: Parameters<typeof api.inviteLink>[0],
) => ["inviteLink", options] as const;
export const inviteLinkOptions = (
  options: Parameters<typeof api.inviteLink>[0],
) =>
  queryOptions({
    queryKey: inviteLinkQueryKey(options),
    queryFn: ({ signal }) => data(api.inviteLink({ ...options, signal })),
  });

export const inviteQueryKey = (options: Parameters<typeof api.invite>[0]) =>
  ["invite", options] as const;
export const inviteOptions = (options: Parameters<typeof api.invite>[0]) =>
  queryOptions({
    queryKey: inviteQueryKey(options),
    queryFn: ({ signal }) => data(api.invite({ ...options, signal })),
  });

export const teamProjectsQueryKey = (
  options: Parameters<typeof api.teamProjects>[0],
) => ["teamProjects", options] as const;
export const teamProjectsOptions = (
  options: Parameters<typeof api.teamProjects>[0],
) =>
  queryOptions({
    queryKey: teamProjectsQueryKey(options),
    queryFn: ({ signal }) => data(api.teamProjects({ ...options, signal })),
  });

export const projectQueryKey = (options: Parameters<typeof api.project>[0]) =>
  ["project", options] as const;
export const projectOptions = (options: Parameters<typeof api.project>[0]) =>
  queryOptions({
    queryKey: projectQueryKey(options),
    queryFn: ({ signal }) => data(api.project({ ...options, signal })),
  });

export const projectMembersQueryKey = (
  options: Parameters<typeof api.projectMembers>[0],
) => ["projectMembers", options] as const;
export const projectMembersOptions = (
  options: Parameters<typeof api.projectMembers>[0],
) =>
  queryOptions({
    queryKey: projectMembersQueryKey(options),
    queryFn: ({ signal }) => data(api.projectMembers({ ...options, signal })),
  });

export const projectComponentsQueryKey = (
  options: Parameters<typeof api.projectComponents>[0],
) => ["projectComponents", options] as const;
export const projectComponentsOptions = (
  options: Parameters<typeof api.projectComponents>[0],
) =>
  queryOptions({
    queryKey: projectComponentsQueryKey(options),
    queryFn: ({ signal }) =>
      data(api.projectComponents({ ...options, signal })),
  });

export const componentQueryKey = (
  options: Parameters<typeof api.component>[0],
) => ["component", options] as const;
export const componentOptions = (
  options: Parameters<typeof api.component>[0],
) =>
  queryOptions({
    queryKey: componentQueryKey(options),
    queryFn: ({ signal }) => data(api.component({ ...options, signal })),
  });

export const listNodeTypesQueryKey = (
  options: Parameters<typeof api.listNodeTypes>[0] = {},
) => ["listNodeTypes", options] as const;
export const listNodeTypesOptions = (
  options: Parameters<typeof api.listNodeTypes>[0] = {},
) =>
  queryOptions({
    queryKey: listNodeTypesQueryKey(options),
    queryFn: ({ signal }) => data(api.listNodeTypes({ ...options, signal })),
  });

function mutation<T, Options>(
  run: (options: Options) => Promise<api.ApiResult<T>>,
): UseMutationOptions<T, api.ApiError, Options> {
  return { mutationFn: (options) => data(run(options)) };
}

export const signOutMutation = () => mutation(api.signOut);

export const deleteTeamMutation = () => mutation(api.deleteTeam);

export const makeOwnerMutation = () => mutation(api.makeOwner);

export const removeMemberMutation = () => mutation(api.removeMember);

export const leaveTeamMutation = () => mutation(api.leaveTeam);

export const joinTeamMutation = () => mutation(api.joinTeam);

export const deleteProjectMutation = () => mutation(api.deleteProject);

export const removeProjectMemberMutation = () =>
  mutation(api.removeProjectMember);

export const setProjectMemberMutation = () => mutation(api.setProjectMember);

export const leaveProjectMutation = () => mutation(api.leaveProject);

export const createComponentMutation = () => mutation(api.createComponent);

export const deleteComponentMutation = () => mutation(api.deleteComponent);

export const renameComponentMutation = () => mutation(api.renameComponent);

export const duplicateComponentMutation = () =>
  mutation(api.duplicateComponent);
