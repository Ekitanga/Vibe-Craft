const asyncHandler = require("../utils/asyncHandler");
const aiAssistantService = require("../services/aiAssistantService");

const chat = asyncHandler(async (req, res) => {
  const { message, history } = req.body || {};
  const result = await aiAssistantService.chat({ message, history });

  res.status(200).json({
    success: true,
    data: result,
  });
});

module.exports = { chat };
