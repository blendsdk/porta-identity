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
  showPurgeUserDialog,
  showSetUserPasswordDialog,
  showUserConfirmationDialog,
  showUserReasonDialog,
} from './user-dialogs.js';
export type {
  AdminUserDialogHost,
  CreateUserDialogResult,
  EditUserDialogResult,
  InviteUserDialogResult,
  PurgeUserDialogResult,
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
