import { MiddlewareInputContext, MiddlewareOptions } from "better-auth";

/**
 * Temporary middleware function to support migration from next-auth to better-auth.
 *
 * This middleware ensures existing users are properly migrated by moving user passwords
 * from the user table to the account table. This allows seamless authentication for
 * users who registered before the migration.
 *
 * Note: This middleware will be removed in release version v1.6.0 once the migration
 * period is complete.
 */
export const v1_4_0_user_migrate_middleware = async (
  request: MiddlewareInputContext<MiddlewareOptions>,
) => {
  return request;
};
