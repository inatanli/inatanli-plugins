# Error Handling

| Scenario | Behavior |
|---|---|
| DataForSEO task creation failure | Retry once. If still fails, ask user to provide product details manually |
| DataForSEO task polling timeout | Task didn't complete within 5 minutes. Retry once. If still fails, ask user for manual input |
| DataForSEO API failure (other) | Retry once. If still fails, skip keyword/competitor data and note gap in brief |
| Product has zero reviews | Note "No reviews available" in insights, rely on description + competitor analysis |
| DataForSEO returns < 3 competitors | Use however many are returned, note in brief |
| DataForSEO returns zero keywords | Skip keyword section, note in brief |

All scripts handle retries and return error JSON internally. If a script returns an error, read the `error` field and follow the behavior above.
