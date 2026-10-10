# Dashboard

Requires the Dataview community plugin.

## Projects

```dataview
TABLE status, budget_aud, committed_aud
FROM "projects"
SORT code ASC
```

## Open proposals

```dataview
TABLE kind, status
FROM "proposals"
WHERE status = "open"
```

## Recent traces

```dataview
TABLE date, route, status
FROM "traces"
SORT date DESC
LIMIT 20
```
