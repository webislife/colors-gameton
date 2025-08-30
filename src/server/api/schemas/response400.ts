export const response400 = {
  400: {
    description: "Ошибка валидации параметров",
    type: "object",
    properties: {
      error: { type: "string" },
      message: { type: "string" },
    },
  },
};
