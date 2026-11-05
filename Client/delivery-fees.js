(function () {
  "use strict";

  // Estimated transport bands from Nairobi. Adjust these amounts as the courier pricing changes.
  var feeBands = {
    0: ["Nairobi"],
    300: ["Kiambu"],
    600: ["Kajiado", "Machakos", "Murang'a"],
    900: ["Embu", "Kirinyaga", "Makueni", "Nakuru", "Nyeri", "Nyandarua"],
    1200: ["Baringo", "Bomet", "Elgeyo-Marakwet", "Kericho", "Laikipia", "Nandi", "Samburu", "Tharaka-Nithi"],
    1500: ["Bungoma", "Busia", "Homa Bay", "Isiolo", "Kakamega", "Kisii", "Kisumu", "Kitui", "Migori", "Nyamira", "Siaya", "Taita-Taveta", "Trans Nzoia", "Uasin Gishu", "Vihiga", "West Pokot"],
    1800: ["Garissa", "Kilifi", "Kwale", "Lamu", "Tana River"],
    2000: ["Mombasa"],
    2500: ["Mandera", "Marsabit", "Meru", "Turkana", "Wajir"],
  };

  var fees = {};
  var availability = {};
  var freeDeliveryMinimum = 0;
  Object.keys(feeBands).forEach(function (amount) {
    feeBands[amount].forEach(function (county) {
      fees[county] = Number(amount);
    });
  });

  if (window.VibecraftApi) {
    window.VibecraftApi.get("settings").then(function (payload) {
      var settings = (payload && payload.data) || {};
      if (settings.deliveryFees) fees = settings.deliveryFees;
      if (settings.deliveryAvailability) availability = settings.deliveryAvailability;
      freeDeliveryMinimum = Number(settings.freeDeliveryMinimum || 0);
      window.dispatchEvent(new Event("vibecraft:delivery-settings"));
    }).catch(function () {});
  }

  window.VibecraftDelivery = {
    getFee: function (county) {
      return Object.prototype.hasOwnProperty.call(fees, county) && availability[county] !== false ? fees[county] : 0;
    },
    getAvailableCounties: function () {
      return Object.keys(fees).filter(function (county) { return availability[county] !== false; });
    },
    getFreeDeliveryMinimum: function () { return freeDeliveryMinimum; },
  };
})();
