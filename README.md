# Dreame D10S Card

A Lovelace card for the [Tasshack dreame_vacuum](https://github.com/Tasshack/dreame-vacuum) Home Assistant integration, built for the Dreame D10S.

This is an independent project. It is not affiliated with, and contains no code from, the official Dreame Vacuum Card.

## Features

**Cleaning**
- Live map from the integration's map camera, or a built-in **floor plan view** drawn from the raw map data
- Pinch/scroll-wheel zoom and pan
- Spot, Room, All and Zone cleaning modes
  - Room: tap rooms to select them; tap order becomes cleaning order
  - Zone: drag to draw up to 5 zones; move, resize or delete them
  - Spot: tap to place up to 5 spots
- Clean / Pause / Resume / Stop / Dock, following the vacuum's state
- Status line, cleaned area, cleaning time and battery
- Banners for errors, an offline robot, low battery, a missing water tank and worn consumables

**Map editor** (map-pen button, or ⋮ → Edit map)
- **Rooms**: rename, set the room type (which sets its icon), per-room suction / water / mode / passes, split with a line, merge two rooms
- **No-go zones**, **no-mop zones** and **virtual walls**: existing ones load from the map; draw, resize, delete, then Save
- **Cleaning order**: tap rooms in order, then Save

**Map objects**
- Obstacle markers; tap one to see the robot's photo, type, confidence and room, and to mark it ignored or avoided
- Furniture hit areas: tap to see type and size

**Sections** (sheets on phones, a side column in panel mode)
- Cleaning settings: mode, suction, water volume, passes, floor map, D10S options
- Maintenance: brushes, filter, sensors and mop pad, with reset
- Cleaning history: totals, plus each past clean with its map
- Maps: switch, rename, back up and delete saved maps; restore recovery points; start fast mapping
- All settings: every entity on the vacuum's device (switches, selects, numbers, times, buttons and sensors), searchable. This covers do-not-disturb, volume and voice settings, among others.

**Panel mode**: a tablet / wall display layout with the map on the left and a tabbed side column. It switches on automatically when the card is at least 820 px wide.

## Install with HACS

1. HACS → ⋮ → **Custom repositories**
2. Add `https://github.com/EthanetXYZ/dreame-d10s-card`, category **Dashboard**
3. Find **Dreame D10S Card** in HACS and download it
4. Reload the browser

HACS adds the dashboard resource for you and offers updates whenever a new release is published.

## Manual install

1. Copy `dreame-d10s-card.js` to `<config>/www/`
2. **Settings → Dashboards → ⋮ → Resources → Add resource**: URL `/local/dreame-d10s-card.js`, type **JavaScript module**

## Usage

```yaml
type: custom:dreame-d10s-card
entity: vacuum.dreame_d10s
```

The card can also be added and configured from the dashboard UI editor.

| Option           | Default             | Description |
|------------------|---------------------|-------------|
| `entity`         | required            | The D10S `vacuum.` entity |
| `map_entity`     | `camera.<name>_map` | Map camera, if yours is named differently |
| `map_data_entity`| `camera.<name>_map_data` | Raw map data camera used by the floor plan view |
| `title`          | friendly name       | Header title |
| `layout`         | `auto`              | `auto`, `compact` or `panel` |
| `floor_plan`     | `false`             | Start in floor plan view (can also be toggled from ⋮) |
| `show_stats`     | `true`              | Show the area / time / battery row |
| `show_obstacles` | `true`              | Show obstacle and furniture markers on the map |
| `entities`       | –                   | Override individual entity IDs, keyed by suffix, e.g. `{ suction_level: select.my_suction }` |

Entity IDs are derived from the vacuum's name (`vacuum.dreame_d10s` → `select.dreame_d10s_suction_level`, `sensor.dreame_d10s_battery_level`, …). Anything missing is simply hidden.

### Floor plan view

The floor plan view draws the map in the card from the integration's raw map data. Room highlighting then follows each room's exact shape, and editor changes show up without waiting for a new camera image. To use it, enable the vacuum's **Map Data** camera entity (`camera.<name>_map_data`; it is disabled by default), then choose ⋮ → Floor plan view.

### Notes

- Editor actions only work on a saved map while the robot isn't cleaning.
- Per-room settings only take effect while **Customized room cleaning** is on.
- Split and merge are processed by the robot, so the map takes a few seconds to update.

## Demo

```bash
node demo/serve.cjs
```

Then open http://localhost:8765 (add `?layout=panel` for panel mode) to try the card against a mocked Home Assistant with a synthetic map.

## License

MIT
