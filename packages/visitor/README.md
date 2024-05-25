This package provides a visitor pattern implementation for the IC-Reactor framework.

### All Possible Number Values and Tags

#### Flags

| Number Value | Key      | Tag                      |
| ------------ | -------- | ------------------------ |
| 1            | Visible  | `[0; 31] + [1]`          |
| 2            | Hidden   | `[0; 30] + [1, 0]`       |
| 4            | Enabled  | `[0; 29] + [1, 0, 0]`    |
| 8            | Disabled | `[0; 28] + [1, 0, 0, 0]` |

#### Properties

| Number Value | Key      | Tag                       |
| ------------ | -------- | ------------------------- |
| 65536        | Optional | `[0; 15] + [1] + [0; 15]` |
| 131072       | Checked  | `[0; 14] + [1] + [0; 16]` |
| 262144       | Dynamic  | `[0; 13] + [1] + [0; 17]` |

### Combined Possible Values

The combined possible values can be derived by adding any combination of the above values. Here are some examples:

- **Single Values:**

  - `1`: Visible
  - `2`: Hidden
  - `4`: Enabled
  - `8`: Disabled
  - `65536`: Optional
  - `131072`: Checked
  - `262144`: Dynamic

- **Combined Values:**
  - `1 + 65536 = 65537`: Visible + Optional
  - `2 + 131072 = 131074`: Hidden + Checked
  - `4 + 262144 = 262148`: Enabled + Dynamic
  - `8 + 65536 = 65544`: Disabled + Optional
  - `1 + 65536 + 131072 = 196609`: Visible + Optional + Checked
  - `2 + 65536 + 262144 = 327682`: Hidden + Optional + Dynamic

...and so on, including all other possible combinations. Each combination represents a different status with multiple properties and flags applied.

### Tags for Combined Values

The tags for combined values are the union of the tags for each component. For example:

- For `65537` (Visible + Optional), the combined tags would be:
  - `[0; 31] + [1]` (from Visible)
  - `[0; 15] + [1] + [0; 15]` (from Optional)

This approach ensures that each combined value and its tags are correctly identified. If you need a full list of every possible combination, please let me know!
