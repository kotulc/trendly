# enrich

Add taggly tags/entities to each article and score it against the topic profile.

**External dependencies:** taggly

## Config

| field | type | default |
|---|---|---|
| top_n | int | 8 |
| score_chars | int | 2000 |
| timeout | float | 30.0 |

## Params

| field | type | default |
|---|---|---|
| topic | str | '' |

## Input

| field | type | default |
|---|---|---|
| articles | list | required |

## Output

| field | type | default |
|---|---|---|
| articles | list | required |
