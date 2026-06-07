export const requestNotificationPermission = async () => {
  if (!("Notification" in window)) {
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission === "denied") {
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === "granted";
};

export const showRiskNotification = ({ title, body }) => {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, {
      body,
      icon: "/favicon.ico",
    });

    return;
  }

  alert(`${title}\n${body}`);
};