import type { Messages } from "@lingui/core";
import { messages as admin } from "./zh-CN/admin.po";
import { messages as auth } from "./zh-CN/auth.po";
import { messages as common } from "./zh-CN/common.po";
import { messages as customConfig } from "./zh-CN/custom-config.po";
import { messages as error } from "./zh-CN/error.po";
import { messages as labels } from "./zh-CN/labels.po";
import { messages as legal } from "./zh-CN/legal.po";
import { messages as notification } from "./zh-CN/notification.po";
import { messages as publicStatus } from "./zh-CN/public-status.po";
import { messages as settingsAccessSecurity } from "./zh-CN/settings-access-security.po";
import { messages as settings } from "./zh-CN/settings.po";
import { messages as subscription } from "./zh-CN/subscription.po";

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
