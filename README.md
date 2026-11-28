# Driver scenarios

Scenario data for [Driver](https://github.com/tzunamipl/Driver) game modes. Data, plus one script that builds the summary index.

- **Official** scenarios: `main` of this repo.
- **Custom** scenarios: any fork or branch. In the game, enter the source as `owner/repo@branch`
  (e.g. `someone/Driver-scenarios@someone`).

## Making scenarios

Use the in-game editor (Game mode → Rally → Editor): drive around and place points at the car.
**Save** commits straight to GitHub: the editor forks this repo to your account (if it isn't yours)
and commits to a branch named after your player name. It needs a classic personal access token
with the `public_repo` scope (stored only in your browser). **Export** gives the JSON to commit by hand.

To make custom scenarios official, open a pull request from your branch to `main`.

## Common rules

- Every file has `"format": 1`. The game ignores files with a newer format than it knows.
- `id`: lowercase `a-z`, `0-9` and `-`; must equal the file name without `.json`.
- Points: `lat`, `lon` (WGS84 degrees) and `width` (metres). A gate is placed across the nearest road,
  centred on it, so it has no direction. Points are driven in the order listed.
- Each mode folder has an `index.json` listing its files by id; the editor keeps it up to date.
- Each mode folder also has a `scenario-index.json` (summary index): never edit it by hand, see below.

## Summary index

The picker's filters (length, surface, days) read `<mode>/scenario-index.json` instead of opening every file.
`scripts/build-scenario-index.mjs` writes it (`node scripts/build-scenario-index.mjs`, no dependencies) and the
`Scenario index` workflow runs it on every push to `main` that touches `rally/`, committing the result when it changed.
Branches and forks get no index, so their picker lists are not filtered.

```
rally/scenario-index.json
{ "format": 1,
  "stages":  [{ "key": "country/region/id", "reverse": true?, "name", "km", "surface" }],
  "rallies": [{ "key", "name", "stageKm", "surface", "days" }] }
```

- `km` / `stageKm`: road length from the pacenotes (else the saved `route`, else the points' straight line x 1.3);
  a rally sums its stage entries, repeats and `reverse` ones included. The game turns `stageKm` into the difficulty bars.
- Every stage without `noReverse` has a second entry with `"reverse": true`.
- `surface`: `tarmac`, `gravel`, `mixed` or `snow` (snow & ice), `null` for a stage without a saved route. Measured
  along the saved route (OSM paved / unpaved, `surfaces` sections over it; cobbles count as tarmac, mud as gravel):
  snow / ice from 50 %, else tarmac or gravel from 90 %, else mixed. A rally weighs its stages by length.
- `days`: one plus each `parcFerme` that is not the last itinerary entry.

## Rally (`rally/`)

```
rally/index.json            { "format": 1, "stages": [ids], "rallies": [ids] }
rally/stages/<id>.json      one stage, playable on its own and reusable in rallies
rally/rallies/<id>.json     base + itinerary
```

### Stage

```json
{
  "format": 1,
  "id": "sleza-north",
  "name": "Ślęża North",
  "points": [
    { "type": "timeControl", "lat": 50.871, "lon": 16.712, "width": 12 },
    { "type": "start", "lat": 50.872, "lon": 16.714, "width": 10 },
    { "type": "split", "lat": 50.861, "lon": 16.731, "width": 10 },
    { "type": "finish", "lat": 50.842, "lon": 16.76, "width": 10 },
    { "type": "stop", "lat": 50.841, "lon": 16.763, "width": 10 }
  ]
}
```

| `type` | Meaning |
|---|---|
| `timeControl` | TC before the stage: check-in, the car is held here |
| `start` | Stage start line: countdown, timing starts (exactly one) |
| `split` | Intermediate timing point |
| `passageControl` | Unmarked required checkpoint, against shortcuts |
| `finish` | Flying finish: timing stops (exactly one, after `start`) |
| `stop` | Stop control after the finish: the car must stop |

### Rally

```json
{
  "format": 1,
  "id": "lower-silesia",
  "name": "Lower Silesia Rally",
  "base": { "name": "Service Park Sobótka", "lat": 50.898, "lon": 16.744 },
  "itinerary": [
    { "type": "podium", "lat": 50.899, "lon": 16.745, "width": 12 },
    { "type": "serviceParkOut", "lat": 50.898, "lon": 16.746, "width": 10 },
    { "stage": "sleza-north" },
    { "stage": "sleza-south" },
    { "type": "serviceParkIn", "lat": 50.897, "lon": 16.743, "width": 10 },
    { "type": "serviceParkOut", "lat": 50.898, "lon": 16.746, "width": 10 },
    { "stage": "sleza-north", "name": "Ślęża North 2" },
    { "type": "parcFerme", "lat": 50.896, "lon": 16.742, "width": 12 }
  ]
}
```

`base` is the rally's service park (optional). Itinerary entries are either a stage reference
(`stage` = stage id, optional `name` for a repeated pass) or a point:

| `type` | Meaning |
|---|---|
| `serviceParkIn` / `serviceParkOut` | Time controls at the service park entry / exit |
| `regroup` | Regroup zone between stages |
| `refuel` | Refuelling zone |
| `tyreFitting` | Tyre fitting zone |
| `remoteService` | Remote service zone, limited repairs |
| `parcFerme` | Parc fermé: end of a leg or the rally |
| `podium` | Ceremonial start / finish ramp |
