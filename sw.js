const CACHE_NAME = "inr-tracker-v1";
const urlsToCache = [
  "/baroda-forex-tracker/",
  "/baroda-forex-tracker/index.html",
  "/baroda-forex-tracker/manifest.json",
  "/baroda-forex-tracker/icon-192.png",
  "/baroda-forex-tracker/inr-rates.json",
  "/baroda-forex-tracker/targets.json",
];

// Install event
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache).catch(() => {
        console.log("Some resources failed to cache");
      });
    }),
  );
  self.skipWaiting();
});

// Activate event
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
  self.clients.claim();
});

// Fetch event
self.addEventListener("fetch", (event) => {
  // For JSON data, try network first, fallback to cache
  if (event.request.url.includes(".json")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clonedResponse);
          });
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        }),
    );
  } else {
    // For other assets, cache first, fallback to network
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      }),
    );
  }
});

// Background sync event - fires periodically
self.addEventListener("sync", (event) => {
  if (event.tag === "check-inr-rate") {
    event.waitUntil(checkINRRate());
  }
});

// Push notification event
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || "INR rate alert",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "inr-alert",
    requireInteraction: true,
    actions: [
      {
        action: "open",
        title: "Open App",
      },
      {
        action: "close",
        title: "Dismiss",
      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || "INR Tracker Alert",
      options,
    ),
  );
});

// Notification click event
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "close") {
    return;
  }

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url === "/" && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow("/");
        }
      }),
  );
});

// Check INR rate function
async function checkINRRate() {
  try {
    const ratesResponse = await fetch("/inr-rates.json");
    const targetsResponse = await fetch("/targets.json");

    const ratesData = await ratesResponse.json();
    const targetsData = await targetsResponse.json();

    if (!ratesData || ratesData.length === 0) {
      console.log("No data available");
      return;
    }

    // Get today's date in DD-MM-YYYY format
    const today = new Date();
    const todayString =
      String(today.getDate()).padStart(2, "0") +
      "-" +
      String(today.getMonth() + 1).padStart(2, "0") +
      "-" +
      today.getFullYear();

    // Find today's entry
    const todayEntry = ratesData.find((entry) => entry.date === todayString);

    if (!todayEntry) {
      console.log("No data for today yet");
      return;
    }

    const currentRate = todayEntry.value;
    console.log(`Current rate: ${currentRate}`);

    // Sort targets by priority (highest first)
    const sortedTargets = targetsData.sort((a, b) => a.priority - b.priority);

    // Find the highest target that the current rate meets
    let matchedTarget = null;
    for (const target of sortedTargets) {
      if (currentRate >= target.target) {
        matchedTarget = target;
        break; // Stop at the first (highest priority) match
      }
    }

    if (matchedTarget) {
      // Check if we've already notified for this today
      const db = await openIndexedDB();
      const notificationState = await getNotificationState(db, todayString);

      if (
        !notificationState ||
        notificationState.targetName !== matchedTarget.name
      ) {
        // Send notification for this target
        await self.registration.showNotification(`${matchedTarget.name}! 🎉`, {
          body: `The INR selling rate is ${currentRate.toFixed(2)} - Meets your "${matchedTarget.name}" target of ${matchedTarget.target.toFixed(2)}!`,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: "inr-alert",
          requireInteraction: true,
          actions: [
            {
              action: "open",
              title: "View Details",
            },
            {
              action: "close",
              title: "Dismiss",
            },
          ],
        });

        // Save notification state
        await saveNotificationState(db, {
          date: todayString,
          rate: currentRate,
          targetName: matchedTarget.name,
          targetValue: matchedTarget.target,
          notified: true,
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      console.log("Current rate does not meet any targets");
    }
  } catch (error) {
    console.error("Error checking INR rate:", error);
  }
}

// IndexedDB helpers
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("inr-tracker-db", 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("notifications")) {
        db.createObjectStore("notifications", { keyPath: "date" });
      }
    };
  });
}

function getNotificationState(db, date) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["notifications"], "readonly");
    const store = transaction.objectStore("notifications");
    const request = store.get(date);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function saveNotificationState(db, data) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["notifications"], "readwrite");
    const store = transaction.objectStore("notifications");
    const request = store.put(data);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
