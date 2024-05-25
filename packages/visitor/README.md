This package provides a visitor pattern implementation for the IC-Reactor framework.

### Dictionary Table

#### Flags

| Key      | Value  | Tag                      |
| -------- | ------ | ------------------------ |
| Visible  | 1 << 0 | `[0; 31] + [1]`          |
| Hidden   | 1 << 1 | `[0; 30] + [1, 0]`       |
| Enabled  | 1 << 2 | `[0; 29] + [1, 0, 0]`    |
| Disabled | 1 << 3 | `[0; 28] + [1, 0, 0, 0]` |

#### Properties

| Key      | Value   | Tag                       |
| -------- | ------- | ------------------------- |
| Optional | 1 << 16 | `[0; 15] + [1] + [0; 15]` |
| Checked  | 1 << 17 | `[0; 14] + [1] + [0; 16]` |
| Dynamic  | 1 << 18 | `[0; 13] + [1] + [0; 17]` |

### Detailed Explanation

1. **Flags:**

   - `Visible`: Represented by `1 << 0` which is equivalent to `1` in binary. Tag `[0; 31] + [1]` suggests it's always present.
   - `Hidden`: Represented by `1 << 1` which is equivalent to `2` in binary. Tag `[0; 30] + [1, 0]` indicates the status is hidden.
   - `Enabled`: Represented by `1 << 2` which is equivalent to `4` in binary. Tag `[0; 29] + [1, 0, 0]` indicates the status is enabled.
   - `Disabled`: Represented by `1 << 3` which is equivalent to `8` in binary. Tag `[0; 28] + [1, 0, 0, 0]` indicates the status is disabled.

2. **Properties:**
   - `Optional`: Represented by `1 << 16` which is equivalent to `65536` in binary. Tag `[0; 15] + [1] + [0; 15]` indicates it's an optional property.
   - `Checked`: Represented by `1 << 17` which is equivalent to `131072` in binary. Tag `[0; 14] + [1] + [0; 16]` indicates the status is checked.
   - `Dynamic`: Represented by `1 << 18` which is equivalent to `262144` in binary. Tag `[0; 13] + [1] + [0; 17]` indicates the status is dynamic.
