export type StatusType = keyof (typeof Status)["_type"]

export class Status {
  private static _flag = {
    ///  [0; 31] + [1]
    Visible: 1 << 0,
    ///  [0; 30] + [1, 0]
    Hidden: 1 << 1,
    ///  [0; 29] + [1, 0, 0]
    Disabled: 1 << 2,
  }

  private static _type = {
    ///  [0; 15] + [1] + [0; 15]
    Optional: 1 << 16,
    ///  [0; 14] + [1] + [0; 16]
    Checked: 1 << 17,
    ///  [0; 13] + [1] + [0; 17]
    FlexRow: 1 << 18,
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
    return (status & this._flag.Visible) !== 0
  }

  /// Method to check if a status is hidden
  public static isHidden(status: number): boolean {
    return (status & this._flag.Hidden) !== 0
  }

  /// Method to check if a status is disabled
  public static isDisabled(status: number): boolean {
    return (status & this._flag.Disabled) !== 0
  }

  /// Method to check if a status is checked
  public static isChecked(status: number): boolean {
    return (status & this._type.Checked) !== 0
  }

  /// Method to check if a status is optional
  public static isOptional(status: number): boolean {
    return (status & this._type.Optional) !== 0
  }

  /// Method to return the flag in a status
  public static flag(status: number): keyof (typeof Status)["_flag"] {
    for (const key in this._flag) {
      if ((status & this._flag[key as keyof (typeof Status)["_flag"]]) !== 0) {
        return key as keyof (typeof Status)["_flag"]
      }
    }
    throw new Error("Invalid status")
  }

  /// Method to return all present types in a status
  public static types(status: number): StatusType[] {
    const types: StatusType[] = []
    for (const key in this._type) {
      if ((status & this._type[key as StatusType]) !== 0) {
        types.push(key as StatusType)
      }
    }
    return types
  }

  /// Method to return all present flags and types in a status
  public static props(status: number) {
    return { flag: this.flag(status), types: this.types(status) }
  }

  /// Method to hide the status
  public static hide(status: number): number {
    if (!this.isOptional(status)) {
      throw new Error("Cannot modify a non-optional status")
    }
    if (this.isHidden(status)) {
      return status
    }
    return (status | this._flag.Hidden) ^ this._flag.Visible
  }

  /// Method to show the status
  public static show(status: number): number {
    if (!this.isOptional(status)) {
      throw new Error("Cannot modify a non-optional status")
    }
    if (this.isVisible(status)) {
      return status
    }
    return (status | this._flag.Visible) ^ this._flag.Hidden
  }

  /// Method to disable the status
  public static disable(status: number): number {
    if (!this.isOptional(status)) {
      throw new Error("Cannot modify a non-optional status")
    }

    if (this.isDisabled(status)) {
      return status
    }
    return status | this._flag.Disabled
  }

  /// Method to enable the status
  public static enable(status: number): number {
    if (!this.isOptional(status)) {
      throw new Error("Cannot modify a non-optional status")
    }

    if (!this.isDisabled(status)) {
      return status
    }
    return status ^ this._flag.Disabled
  }

  /// Method to add the checked status
  public static addChecked(status: number): number {
    return status | this._type.Checked
  }

  /// Method to remove the checked status
  public static removeChecked(status: number): number {
    return status & ~this._type.Checked
  }
}
