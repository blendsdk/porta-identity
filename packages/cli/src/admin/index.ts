/** Public entry point for the administration application owned by the CLI. */

export { runAdminApplication } from './application.js';
export type {
  AdminApplicationOptions,
  AdminApplicationSession,
  AdminExitCode,
} from './application.js';
export {
  showCreateOrganizationDialog,
  showOrganizationChooser,
  showWhoAmIDialog,
} from './organization-dialogs.js';
export type {
  AuthenticatedAdminState,
  CreateOrganizationDialogResult,
  OrganizationChoiceResult,
  OrganizationChooserOptions,
} from './organization-dialogs.js';
export { ADMIN_COMMANDS } from './presentation.js';
export type {
  AdminCapabilities,
  AdminConnectionState,
  AdminFailureKind,
  AdminOrganizationContext,
  AdminOrganizationFailureKind,
  AdminPublicFailure,
} from './state.js';
export { createAdminUserOperations } from './user-service.js';
export { createAdminUserController } from './user-controller.js';
export type {
  AdminUserController,
  AdminUserControllerDialogs,
  AdminUserControllerOptions,
} from './user-controller.js';
export {
  showCreateUserDialog,
  showEditUserDialog,
  showInviteUserDialog,
  showDeleteUserDialog,
  showSetUserPasswordDialog,
  showUserConfirmationDialog,
  showUserReasonDialog,
} from './user-dialogs.js';
export type {
  AdminUserDialogHost,
  CreateUserDialogResult,
  EditUserDialogResult,
  InviteUserDialogResult,
  DeleteUserDialogResult,
  SetUserPasswordDialogResult,
  UserConfirmationAction,
  UserConfirmationDialogResult,
  UserReasonDialogResult,
} from './user-dialogs.js';
export type {
  AdminCreateUserInput,
  AdminInviteUserInput,
  AdminInvitedUser,
  AdminSetPasswordInput,
  AdminUserDetailResult,
  AdminUserListRequest,
  AdminUserMutationResult,
  AdminUserOperations,
  AdminUserReadResult,
} from './user-service.js';
export type {
  AdminInvitationPreview,
  AdminUserDetail,
  AdminUserFailureKind,
  AdminUserHistory,
  AdminUserHistoryEntry,
  AdminUserListItem,
  AdminUserOutcome,
  AdminUserPage,
  AdminUserProjection,
  AdminUserSelection,
  AdminUserStatus,
  AdminUserViewState,
} from './user-state.js';
export { createAdminUserWorkspace } from './user-workspace.js';
export type {
  AdminUserIntent,
  AdminUserWorkspace,
  AdminUserWorkspaceOptions,
} from './user-workspace.js';
export { createAdminApplicationOperations } from './application-service.js';
export type { AdminApplicationOperations } from './application-service.js';
export { createAdminApplicationController } from './application-controller.js';
export type {
  AdminApplicationController,
  AdminApplicationControllerOptions,
} from './application-controller.js';
export type {
  AdminApplication,
  AdminApplicationDetailProjection,
  AdminApplicationFailureKind,
  AdminApplicationListProjection,
  AdminApplicationModule,
  AdminApplicationModuleStatus,
  AdminApplicationMutationResult,
  AdminApplicationProjection,
  AdminApplicationReadResult,
  AdminApplicationStatus,
  AdminApplicationViewState,
} from './application-state.js';
export { createAdminApplicationWorkspace } from './application-workspace.js';
export type {
  AdminApplicationIntent,
  AdminApplicationWorkspace,
  AdminApplicationWorkspaceOptions,
} from './application-workspace.js';
export {
  showApplicationLifecycleDialog,
  showCreateApplicationDialog,
  showCreateModuleDialog,
  showEditApplicationDialog,
  showEditModuleDialog,
  showModuleDeactivationDialog,
} from './application-dialogs.js';
export type {
  AdminApplicationDialogHost,
  ApplicationLifecycleAction,
  ApplicationLifecycleDialogResult,
  CreateApplicationDialogResult,
  CreateModuleDialogResult,
  EditApplicationDialogResult,
  EditModuleDialogResult,
  ModuleDeactivationDialogResult,
} from './application-dialogs.js';
export { createAdminClientOperations } from './client-service.js';
export type {
  AdminClientCreateResult,
  AdminClientOperations,
} from './client-service.js';
export { createAdminClientController } from './client-controller.js';
export type {
  AdminClientController,
  AdminClientControllerOptions,
} from './client-controller.js';
export type {
  AdminClient,
  AdminClientDetailProjection,
  AdminClientFailureKind,
  AdminClientListProjection,
  AdminClientMutationResult,
  AdminClientProjection,
  AdminClientReadResult,
  AdminClientSecret,
  AdminClientSecretPresentation,
  AdminClientStatus,
  AdminClientViewState,
  AdminGeneratedClientSecret,
} from './client-state.js';
export { createAdminClientWorkspace } from './client-workspace.js';
export type {
  AdminClientIntent,
  AdminClientWorkspace,
  AdminClientWorkspaceOptions,
} from './client-workspace.js';
export {
  showClientAuthenticationDialog,
  showClientLifecycleDialog,
  showClientLoginDialog,
  showClientProtocolDialog,
  showClientRegistrationDialog,
  showDeleteClientDialog,
  showEditClientNameDialog,
  showGenerateClientSecretDialog,
  showOneTimeClientSecretDialog,
  showRevokeClientSecretDialog,
} from './client-dialogs.js';
export { createAdminApplicationClientFeatures } from './application-client-features.js';
export type {
  AdminApplicationClientFeatures,
  AdminApplicationClientFeaturesOptions,
} from './application-client-features.js';
export type {
  AdminClientRegistrationDialogHost,
  AdminClientRegistrationDialogOptions,
  AdminClientRegistrationDialogResult,
  AdminClientDialogHost,
  ClientAuthenticationDialogHost,
  ClientAuthenticationDialogResult,
  ClientCredentialDialogHost,
  ClientFocusedEditorResult,
  ClientLifecycleDialogResult,
  ClientProtocolLoginDialogHost,
  DeleteClientDialogResult,
  EditClientNameDialogResult,
  GenerateClientSecretDialogResult,
  RevokeClientSecretDialogResult,
} from './client-dialogs.js';
