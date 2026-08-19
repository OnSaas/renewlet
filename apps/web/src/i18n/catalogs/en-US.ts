import type { Messages } from "@lingui/core";
import { messages as admin } from "./en-US/admin.po";
import { messages as auth } from "./en-US/auth.po";
import { messages as common } from "./en-US/common.po";
import { messages as customConfig } from "./en-US/custom-config.po";
import { messages as error } from "./en-US/error.po";
import { messages as labels } from "./en-US/labels.po";
import { messages as legal } from "./en-US/legal.po";
import { messages as notification } from "./en-US/notification.po";
import { messages as publicStatus } from "./en-US/public-status.po";
import { messages as settingsAccessSecurity } from "./en-US/settings-access-security.po";
import { messages as settings } from "./en-US/settings.po";
import { messages as subscription } from "./en-US/subscription.po";

export const messages = {
  ...admin,
  ...auth,
  ...common,
  ...customConfig,
  ...error,
  ...labels,
  ...legal,
  ...notification,
  ...publicStatus,
  ...settingsAccessSecurity,
  ...settings,
  ...subscription,
} satisfies Messages;
