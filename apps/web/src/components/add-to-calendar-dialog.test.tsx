// 添加到日历弹窗测试锁住一次性 ICS 下载不再依赖浏览器端序列化。
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertDateOnly } from "@/lib/time/date-only";
import type { Subscription } from "@/types/subscription";
import { AddToCalendarDialog } from "./add-to-calendar-dialog";

const mocks = vi.hoisted(() => ({
  createSubscriptionCalendarFeed: vi.fn(),
  deleteSubscriptionCalendarFeed: vi.fn(),
  downloadFile: vi.fn(),
  downloadSubscriptionIcs: vi.fn(),
  subscriptionCalendarFeedStatus: { data: { enabled: false, feedUrl: undefined as string | undefined }, isLoading: false },
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalExecCommandDescriptor = Object.getOwnPropertyDescriptor(document, "execCommand");
const originalWindowOpen = window.open;

vi.mock("@/contexts/CustomConfigContext", () => ({
  useCustomConfigState: () => ({
    config: {
      categories: [{
        id: "productivity",
        value: "productivity",
        labels: { "zh-CN": "效率工具", "en-US": "Productivity" },
      }],
      statuses: [],
      paymentMethods: [{
        id: "credit-card",
        value: "credit_card",
        labels: { "zh-CN": "信用卡", "en-US": "Credit Card" },
      }],
      currencies: [],
    },
  }),
}));

vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({
    data: { notificationReminderDays: 5 },
  }),
}));

vi.mock("@/hooks/use-calendar-feed", () => ({
  useCreateSubscriptionCalendarFeed: () => ({
    isPending: false,
    mutateAsync: mocks.createSubscriptionCalendarFeed,
  }),
  useDeleteSubscriptionCalendarFeed: () => ({
    isPending: false,
    mutateAsync: mocks.deleteSubscriptionCalendarFeed,
  }),
  useSubscriptionCalendarFeedStatus: () => mocks.subscriptionCalendarFeedStatus,
}));

vi.mock("@/services/calendar-feed-service", () => ({
  calendarFeedService: {
    downloadSubscriptionIcs: mocks.downloadSubscriptionIcs,
  },
}));

vi.mock("@/shared/browser/download-file", () => ({
  downloadFile: mocks.downloadFile,
}));

vi.mock("@/components/ui/sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

const subscription: Subscription = {
  id: "sub-1",
  name: "Fastmail",
  logo: undefined,
  price: "5",
  currency: "USD",
  billingCycle: "monthly",
  customDays: undefined,
  customCycleUnit: undefined,
  oneTimeTermCount: undefined,
  oneTimeTermUnit: undefined,
  category: "productivity",
  status: "active",
  paymentMethod: "credit_card",
  startDate: assertDateOnly("2026-05-15"),
  nextBillingDate: assertDateOnly("2026-06-15"),
  autoRenew: false,
  autoCalculateNextBillingDate: true,
  trialEndDate: undefined,
  website: "https://fastmail.example",
  notes: "Team plan",
  tags: [],
  reminderDays: 7,
  repeatReminderEnabled: false,
  repeatReminderInterval: "1h",
  repeatReminderWindow: "72h",
  extra: {},
  pinned: false,
  publicHidden: false,
};

function renderDialog(value: Subscription = subscription) {
  return render(
    <AddToCalendarDialog
      open
      onOpenChange={vi.fn()}
      subscription={value}
    />,
  );
}

function mockUserAgent(userAgent: string) {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, value: userAgent });
  return () => {
    if (descriptor) Object.defineProperty(window.navigator, "userAgent", descriptor);
    else Reflect.deleteProperty(window.navigator, "userAgent");
  };
}

function withoutRandomUUID(callback: () => void) {
  const cryptoObject = window.crypto;
  const descriptor = Object.getOwnPropertyDescriptor(cryptoObject, "randomUUID");
  Object.defineProperty(cryptoObject, "randomUUID", { configurable: true, value: undefined });
  try {
    callback();
  } finally {
    if (descriptor) {
      Object.defineProperty(cryptoObject, "randomUUID", descriptor);
    } else {
      Reflect.deleteProperty(cryptoObject, "randomUUID");
    }
  }
}

describe("AddToCalendarDialog", () => {
  beforeEach(() => {
    mocks.createSubscriptionCalendarFeed.mockReset();
    mocks.deleteSubscriptionCalendarFeed.mockReset();
    mocks.downloadFile.mockReset();
    mocks.downloadSubscriptionIcs.mockReset();
    mocks.subscriptionCalendarFeedStatus = { data: { enabled: false, feedUrl: undefined }, isLoading: false };
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.createSubscriptionCalendarFeed.mockResolvedValue({
      enabled: true,
      createdAt: "2026-05-18T00:00:00.000Z",
      updatedAt: "2026-05-18T00:00:00.000Z",
      feedUrl: "https://example.com/calendar/renewals.ics?token=secret",
    });
    mocks.downloadSubscriptionIcs.mockResolvedValue(new Blob(["BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"], { type: "text/calendar;charset=utf-8" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", {
      headers: { "content-type": "text/calendar; charset=utf-8" },
    })));
  });

  afterEach(() => {
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
    if (originalExecCommandDescriptor) {
      Object.defineProperty(document, "execCommand", originalExecCommandDescriptor);
    } else {
      Reflect.deleteProperty(document, "execCommand");
    }
    Object.defineProperty(window, "open", { configurable: true, value: originalWindowOpen });
    vi.unstubAllGlobals();
  });

  it("renders without crypto.randomUUID", () => {
    withoutRandomUUID(() => {
      renderDialog();
    });

    expect(screen.getByRole("dialog", { name: "添加到日历" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下载 ICS 文件" })).toBeInTheDocument();
  });

  it("keeps one dialog shell while detail data replaces the loading state", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <AddToCalendarDialog
        open
        onOpenChange={onOpenChange}
        subscription={null}
        loading
      />,
    );
    const loadingDialog = screen.getByRole("dialog", { name: "添加到日历" });

    rerender(
      <AddToCalendarDialog
        open
        onOpenChange={onOpenChange}
        subscription={subscription}
        loading={false}
      />,
    );

    expect(screen.getByRole("dialog", { name: "添加到日历" })).toBe(loadingDialog);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "下载 ICS 文件" })).toBeInTheDocument();
  });

  it("renders the full calendar workflow and activates a newly generated feed", async () => {
    const open = vi.fn();
    Object.defineProperty(window, "open", { configurable: true, value: open });

    renderDialog();

    expect(screen.getByText("为「Fastmail」创建单独日历订阅，只同步这一条续费。")).toBeInTheDocument();
    expect(screen.getByText("2026年6月15日")).toBeInTheDocument();
    expect(screen.getByText("持续同步此订阅")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "用 Google Calendar 打开" })).toHaveAttribute(
      "href",
      expect.stringContaining("calendar.google.com"),
    );
    expect(screen.getByRole("link", { name: "用 Outlook.com 打开" })).not.toHaveClass("bg-primary");
    expect(screen.getByRole("link", { name: "用 Office 365 打开" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "用 Yahoo Calendar 打开" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "生成订阅链接" }));

    await waitFor(() => expect(mocks.createSubscriptionCalendarFeed).toHaveBeenCalledWith("sub-1"));
    expect(open).toHaveBeenCalledWith("webcal://example.com/calendar/renewals.ics?token=secret", "_self");
    expect(screen.getByLabelText("本次订阅 URL")).toHaveValue("https://example.com/calendar/renewals.ics?token=secret");
    expect(screen.getByRole("button", { name: "重新生成订阅链接" })).toBeInTheDocument();
  });

  it("uses an existing feed without generating another token", async () => {
    const open = vi.fn();
    Object.defineProperty(window, "open", { configurable: true, value: open });
    mocks.subscriptionCalendarFeedStatus = {
      data: { enabled: true, feedUrl: "https://example.com/calendar/renewals.ics?token=existing" },
      isLoading: false,
    };

    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "在系统日历中订阅" }));

    await waitFor(() => expect(open).toHaveBeenCalledWith(
      "webcal://example.com/calendar/renewals.ics?token=existing",
      "_self",
    ));
    expect(screen.getByLabelText("本次订阅 URL")).toHaveValue("https://example.com/calendar/renewals.ics?token=existing");
    expect(screen.queryByRole("button", { name: "生成订阅链接" })).not.toBeInTheDocument();
    expect(mocks.createSubscriptionCalendarFeed).not.toHaveBeenCalled();
  });

  it("does not open the system calendar when feed preflight returns HTML", async () => {
    const open = vi.fn();
    Object.defineProperty(window, "open", { configurable: true, value: open });
    const fetchMock = vi.fn().mockResolvedValue(new Response("<html></html>", {
      headers: { "content-type": "text/html" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.subscriptionCalendarFeedStatus = {
      data: { enabled: true, feedUrl: "http://localhost:5173/calendar/renewals.ics?token=existing" },
      isLoading: false,
    };

    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "在系统日历中订阅" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:5173/calendar/renewals.ics?token=existing",
      {
        cache: "no-store",
        credentials: "omit",
        headers: { Accept: "text/calendar,*/*;q=0.1" },
      },
    ));
    expect(open).not.toHaveBeenCalled();
  });

  it("uses an Android insert intent for the one-off calendar event", () => {
    const restoreUserAgent = mockUserAgent(
      "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36",
    );
    try {
      renderDialog();

      const link = screen.getByRole("link", { name: "添加单次事件到 Android 日历" });
      expect(link).toHaveAttribute("href", expect.stringContaining("intent://renewlet/calendar-event#Intent;"));
      expect(link).toHaveAttribute("href", expect.stringContaining("action=android.intent.action.INSERT"));
      expect(link).toHaveAttribute("href", expect.stringContaining("type=vnd.android.cursor.dir/event"));
      expect(link).toHaveAttribute("href", expect.stringContaining("S.title=Fastmail"));
    } finally {
      restoreUserAgent();
    }
  });

  it("renders fixed-term one-time subscriptions as expiry events", () => {
    const fixedTerm: Subscription = {
      ...subscription,
      billingCycle: "one-time",
      customDays: undefined,
      customCycleUnit: undefined,
      oneTimeTermCount: 6,
      oneTimeTermUnit: "month",
      autoRenew: false,
      autoCalculateNextBillingDate: false,
    };

    renderDialog(fixedTerm);

    expect(screen.getByRole("dialog", { name: "添加到期日历" })).toBeInTheDocument();
    expect(screen.getByText("为「Fastmail」创建单独日历订阅，只同步这次服务到期。")).toBeInTheDocument();
    expect(screen.getByText("2026年6月15日")).toBeInTheDocument();
  });

  it("downloads one-off ICS through the authenticated calendar service", async () => {
    const icsBlob = new Blob(["BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"], { type: "text/calendar;charset=utf-8" });
    mocks.downloadSubscriptionIcs.mockResolvedValueOnce(icsBlob);

    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "下载 ICS 文件" }));

    await waitFor(() => expect(mocks.downloadSubscriptionIcs).toHaveBeenCalledWith("sub-1"));
    expect(mocks.downloadFile).toHaveBeenCalledWith(icsBlob, "renewlet-sub-1.ics");
    expect(mocks.toastSuccess).toHaveBeenCalledWith("ICS 文件已生成");
  });

  it("shows a recoverable toast when one-off ICS download fails", async () => {
    mocks.downloadSubscriptionIcs.mockRejectedValueOnce(new Error("download failed"));

    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "下载 ICS 文件" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("ICS 文件生成失败"));
    expect(mocks.downloadFile).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "添加到日历" })).toBeInTheDocument();
  });

  it("shows a localized copy failure instead of leaking missing Clipboard API errors", async () => {
    mocks.subscriptionCalendarFeedStatus = {
      data: {
        enabled: true,
        feedUrl: "https://example.com/calendar/renewals.ics?token=secret",
      },
      isLoading: false,
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => false),
    });

    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "复制 URL" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("订阅 URL 复制失败", {
      description: "当前一键复制不可用，请手动选择并复制本次 URL。",
    }));
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.stringContaining("writeText"));
    expect(screen.getByLabelText("本次订阅 URL")).toHaveFocus();
  });
});
