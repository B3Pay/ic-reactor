function validateError(covariant: (value: any) => string | boolean) {
  return function validate(value: any) {
    try {
      covariant(value)
      return true
    } catch (error) {
      return (error as Error).message || "An error occurred"
    }
  }
}
