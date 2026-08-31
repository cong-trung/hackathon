export function validatePYPCSForm(visibleQuestions, answers) {
  const errors = {};

  visibleQuestions.forEach((question) => {
    const questionId = question.question_id;
    const value = answers[questionId];

    if (question.required && (!value || String(value).trim() === "")) {
      errors[questionId] = `${question.display_label || questionId} is required`;
      return;
    }

    if (
      question.field_type === "select" &&
      value &&
      Array.isArray(question.options) &&
      question.options.length > 0 &&
      !question.options.includes(value)
    ) {
      errors[questionId] = `${question.display_label || questionId} must be one of: ${question.options.join(", ")}`;
    }
  });

  return errors;
}