export type StatusType = keyof (typeof Status)["_type"]

export class Status {
  /// Define the _flag object with bit flags for visibility
  private static _flag = {
    Visible: 1 << 0, /// Bit flag for visible status
    Hidden: 1 << 1, /// Bit flag for hidden status
    Disabled: 1 << 2, /// Bit flag for disabled status
  }

  /// Define the _type object with bit flags for different types
  private static _type = {
    Optional: 1 << 16, /// Bit flag for optional status
    Checked: 1 << 17, /// Bit flag for checked status
    FlexRow: 1 << 18, /// Bit flag for flex row status
  }

  /// Getter for the _flag object
  public static get Flag() {
    return this._flag
  }

  /// Getter for the _type object
  public static get Type() {
    return this._type
  }

  /// Default status is visible
  public static Default = this._flag.Visible

  /// Method to get the number representing visible status with given types
  public static Visible(...types: StatusType[]): number {
    let result = this._flag.Visible
    for (const type of types) {
      result |= this._type[type]
    }
    return result
  }

  /// Method to get the number representing hidden status with given types
  public static Hidden(...types: StatusType[]): number {
    let result = this._flag.Hidden
    for (const type of types) {
      result |= this._type[type]
    }
    return result
  }

  /// Method to get the number representing disabled status with given types
  public static Disabled(...types: StatusType[]): number {
    let result = this._flag.Disabled
    for (const type of types) {
      result |= this._type[type]
    }
    return result
  }

  /// Method to check if a status is visible
  public static isVisible(status: number): boolean {
    return (status & Status.Visible()) !== 0
  }

  /// Method to check if a status is hidden
  public static isHidden(status: number): boolean {
    return (status & this.Hidden()) !== 0
  }

  /// Method to check if a status is disabled
  public static isDisabled(status: number): boolean {
    return (status & this.Disabled()) !== 0
  }

  /// Method to check if a status is checked
  public static isChecked(status: number): boolean {
    return (status & this._type.Checked) !== 0
  }

  /// Method to check if a status is optional
  public static isOptional(status: number): boolean {
    return (status & this._type.Optional) !== 0
  }

  /// Method to toggle the checked status
  public static toggleChecked(status: number): number {
    return status ^ this._type.Checked
  }

  /// Method to toggle the visibility status
  public static toggleVisibility(status: number): number {
    return status ^ Status.Visible()
  }
}
