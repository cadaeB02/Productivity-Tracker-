---
name: ios-shortcut-builder
description: Build Apple iOS Shortcut (.shortcut) files programmatically using plist generation
---

# iOS Shortcut Builder Skill

Generate `.shortcut` files that can be AirDropped to an iPhone and installed directly in the Shortcuts app.

## How It Works

Apple `.shortcut` files are binary Property List (bplist) files. This skill:
1. Builds the shortcut as an XML plist using a Node.js script
2. Converts to binary plist using macOS `plutil`
3. Outputs a `.shortcut` file ready for AirDrop

## Usage

### Step 1: Define Your Shortcut

Create a JSON definition of the shortcut actions. Use the action reference in `resources/actions.md` for available action identifiers.

### Step 2: Run the Generator

```bash
node <skill_dir>/scripts/generate-shortcut.js <config.json> <output.shortcut>
```

Or call the generator function from your own script:
```javascript
const { generateShortcut } = require('<skill_dir>/scripts/generate-shortcut.js');
await generateShortcut(actionsArray, 'My Shortcut Name', '/path/to/output.shortcut');
```

### Step 3: Transfer to iPhone

```bash
# Option A: AirDrop (requires Finder)
open /path/to/output.shortcut

# Option B: Host locally and open on phone
# Place in a web-accessible directory and open the URL on the iPhone
```

## Key Concepts

### Action Structure
Every action is a dict with:
- `WFWorkflowActionIdentifier` — the action type (e.g., `is.workflow.actions.getcontentsofurl`)
- `WFWorkflowActionParameters` — config dict specific to that action

### Variable References
Variables reference previous action outputs using:
```json
{
  "Value": {
    "Type": "Variable",
    "VariableName": "myVar"
  },
  "WFSerializationType": "WFTextTokenAttachment"
}
```

### Magic Variables (Action Output)
Reference the output of a specific action by its UUID:
```json
{
  "Value": {
    "Type": "ActionOutput",
    "OutputName": "Health Samples",
    "OutputUUID": "<action-uuid>"
  },
  "WFSerializationType": "WFTextTokenAttachment"  
}
```

### Grouping (If/Otherwise/End If)
If/Otherwise/End If actions share a `GroupingIdentifier` UUID:
- If: `WFControlFlowMode: 0`
- Otherwise: `WFControlFlowMode: 1`  
- End If: `WFControlFlowMode: 2`

## Common Action Identifiers

| Action | Identifier |
|--------|-----------|
| Find Health Samples | `is.workflow.actions.health.quantity.get` |
| Get Variable | `is.workflow.actions.getvariable` |
| Set Variable | `is.workflow.actions.setvariable` |
| Text | `is.workflow.actions.gettext` |
| Get Contents of URL | `is.workflow.actions.downloadurl` |
| If | `is.workflow.actions.conditional` |
| Format Date | `is.workflow.actions.format.date` |
| Ask for Input | `is.workflow.actions.ask` |
| Show Notification | `is.workflow.actions.notification` |
| Calculate Statistics | `is.workflow.actions.statistics` |
| Count | `is.workflow.actions.count` |
| Repeat with Each | `is.workflow.actions.repeat.each` |
| Number | `is.workflow.actions.number` |
| Math (Calculate) | `is.workflow.actions.math` |

## Examples

See `examples/sleep-sync-v1.js` for a basic sleep sync shortcut and `examples/sleep-sync-v2.js` for the full version with phase tracking.
