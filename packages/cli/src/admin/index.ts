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
export {
  createAdminUserRoleController,
  openAdminUserRoleWorkflow,
} from './user-role-controller.js';
export type {
  AdminUserRoleContext,
  AdminUserRoleController,
  AdminUserRoleControllerOptions,
  AdminUserRoleOperations,
  AdminUserRoleWorkflow,
  AdminUserRoleWorkflowOptions,
} from './user-role-controller.js';
export { createAdminUserRoleDialog } from './user-role-dialog.js';
export type {
  AdminAssignedUserRole,
  AdminUserRoleDialog,
  AdminUserRoleDialogOptions,
  AdminUserRoleIntent,
  AdminUserRoleReadyProjection,
  AdminUserRoleViewState,
} from './user-role-dialog.js';
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
export { createAdminApplicationRbacController } from './application-rbac-controller.js';
export type {
  AdminApplicationRbacContext,
  AdminApplicationRbacController,
  AdminApplicationRbacControllerOptions,
} from './application-rbac-controller.js';
export { createAdminApplicationRbacFeatures } from './application-rbac-features.js';
export type {
  AdminApplicationRbacFeatures,
  AdminApplicationRbacFeaturesOptions,
  AdminApplicationRbacSelection,
} from './application-rbac-features.js';
export { createAdminApplicationRbacWorkspace } from './application-rbac-workspace.js';
export type {
  AdminApplicationRbacIntent,
  AdminApplicationRbacWorkspace,
  AdminApplicationRbacWorkspaceOptions,
} from './application-rbac-workspace.js';
export {
  showCreatePermissionDialog,
  showCreateRoleDialog,
  showDeletePermissionDialog,
  showDeleteRoleDialog,
  showEditPermissionDialog,
  showEditRoleDialog,
  showManageRolePermissionsDialog,
} from './rbac-dialogs.js';
export type {
  CreatePermissionDialogResult,
  CreateRoleDialogResult,
  DeletePermissionDialogResult,
  DeleteRoleDialogResult,
  EditPermissionDialogResult,
  EditRoleDialogResult,
  ManageRolePermissionsDialogResult,
} from './rbac-dialogs.js';
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
export type { AdminClientCreateResult, AdminClientOperations } from './client-service.js';
export { createAdminClientController } from './client-controller.js';
export type { AdminClientController, AdminClientControllerOptions } from './client-controller.js';
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
  AUTHENTICATION_URL_CHOICES,
  authenticationUrlRows,
  buildAuthenticationUrlUpdate,
  showAuthenticationUrlDialog,
  showDeleteAuthenticationUrlDialog,
  showClientLifecycleDialog,
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
export { createAdminPortabilityController, PORTABILITY_COMMAND } from './portability-controller.js';
export type {
  AdminPortabilityController,
  AdminPortabilityControllerHost,
  AdminPortabilityControllerOptions,
  AdminPortabilityDialogs,
  AdminPortabilityFiles,
} from './portability-controller.js';
export { createAdminPortabilityOperations } from './portability-service.js';
export {
  createAdminSystemConfigController,
  SYSTEM_CONFIG_COMMAND,
} from './system-config-controller.js';
export type {
  AdminSystemConfigController,
  AdminSystemConfigControllerHost,
  AdminSystemConfigControllerOptions,
} from './system-config-controller.js';
export {
  ADMIN_CONFIG_KEYS,
  createAdminSystemConfigOperations,
  isAdminConfigKey,
  isAdminConfigValue,
  validateAdminConfigEntries,
} from './system-config-service.js';
export type {
  AdminConfigFailure,
  AdminConfigReadResult,
  AdminConfigMutationResult,
  AdminSystemConfigOperations,
} from './system-config-service.js';
export {
  formatAdminConfigDuration,
  parseAdminConfigDraft,
  projectAdminConfigDrafts,
  setAdminConfigDraft,
} from './system-config-state.js';
export type {
  AdminSystemConfigIntent,
  AdminSystemConfigReadyState,
  AdminSystemConfigWorkspaceState,
  AdminSystemConfigDraftProjection,
} from './system-config-state.js';
export {
  createAdminSystemConfigWorkspace,
  SYSTEM_CONFIG_MINIMUM_SIZE,
} from './system-config-workspace.js';
export type {
  AdminSystemConfigCapabilities,
  AdminSystemConfigWorkspace,
  AdminSystemConfigWorkspaceOptions,
} from './system-config-workspace.js';
export type { AdminPortabilityOperations } from './portability-service.js';
export { createAdminPortabilityWorkspace } from './portability-workspace.js';
export type {
  AdminPortabilityCapabilities,
  AdminPortabilityWorkspace,
  AdminPortabilityWorkspaceOptions,
} from './portability-workspace.js';
export type {
  AdminPortabilityAppliedResult,
  AdminPortabilityExportSelection,
  AdminPortabilityFeedback,
  AdminPortabilityImportMode,
  AdminPortabilityImportSelection,
  AdminPortabilityIntent,
  AdminPortabilityPendingOperation,
  AdminPortabilityWorkspaceState,
} from './portability-state.js';
export type {
  AdminAuthenticationUrlRow,
  AuthenticationUrlChoice,
  AuthenticationUrlDialogResult,
  AuthenticationUrlDraft,
  AuthenticationUrlKind,
  AuthenticationUrlMutation,
  AdminClientRegistrationDialogHost,
  AdminClientRegistrationDialogOptions,
  AdminClientRegistrationDialogResult,
  AdminClientDialogHost,
  ClientAuthenticationDialogHost,
  DeleteAuthenticationUrlDialogResult,
  ClientCredentialDialogHost,
  ClientLifecycleDialogResult,
  DeleteClientDialogResult,
  EditClientNameDialogResult,
  GenerateClientSecretDialogResult,
  RevokeClientSecretDialogResult,
} from './client-dialogs.js';
