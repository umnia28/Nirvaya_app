export const getCurrentLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        reject(new Error(error.message || "Failed to get location."));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
};

export const watchLocation = (onLocation, onError) => {
  if (!navigator.geolocation) {
    throw new Error("Geolocation is not supported by this browser.");
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      onLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    },
    (error) => {
      if (onError) onError(error);
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
    }
  );

  return watchId;
};

export const clearLocationWatch = (watchId) => {
  if (watchId !== null && watchId !== undefined) {
    navigator.geolocation.clearWatch(watchId);
  }
};


export const calculateDistanceMeters = (pointA, pointB) => {
  if (!pointA || !pointB) return Infinity;

  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;

  const lat1 = pointA.latitude;
  const lon1 = pointA.longitude;
  const lat2 = pointB.latitude;
  const lon2 = pointB.longitude;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};