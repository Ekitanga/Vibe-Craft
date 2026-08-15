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
  Object.keys(feeBands).forEach(function (amount) {
    feeBands[amount].forEach(function (county) {
      fees[county] = Number(amount);
    });
  });

  window.VibecraftDelivery = {
    getFee: function (county) {
      return Object.prototype.hasOwnProperty.call(fees, county) ? fees[county] : 0;
    },
  };
})();
