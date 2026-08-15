const feeBands = {
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

const deliveryFees = Object.entries(feeBands).reduce((result, [amount, counties]) => {
  counties.forEach((county) => {
    result[county] = Number(amount);
  });
  return result;
}, {});

const getDeliveryFee = (county) => deliveryFees[county] || 0;

module.exports = { getDeliveryFee };
