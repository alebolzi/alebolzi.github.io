self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", () => {
    console.log("Service Worker attivo");
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
});
