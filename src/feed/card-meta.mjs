const defaults = {
  status: { key: 'status', label: 'Status', color: 'amber' },
  categories: { key: 'categories', label: 'Category', color: 'blue' },
  tags: { key: 'tags', label: 'Tag', color: 'violet' },
}

const hues = { blue: 210, violet: 265, rose: 340, amber: 35, teal: 190, green: 150 }

function label(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalize_tags(tags) {
  return [...new Set(tags.map(tag => tag.normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim()).filter(Boolean))]
}

export function card_meta(frontmatter, config, draft = false) {
  const facets = Object.entries({ ...defaults, ...config }).flatMap(([name, spec]) => {
    const options = spec && typeof spec === 'object' && !Array.isArray(spec) ? spec : { key: spec }
    const keys = options.key ?? options.field ?? name
    const labels = (Array.isArray(keys) ? keys : [keys]).flatMap(key => {
      const value = frontmatter[key]
      return (Array.isArray(value) ? value : [value]).map(label).filter(Boolean)
    }).filter(value => !draft || name !== 'status' || value.toLowerCase() !== 'draft')
    const values = name === 'tags' ? normalize_tags(draft ? ['draft', ...labels] : labels) : [...new Set(labels)]
    if (!values.length) return []
    return [{
      name, label: label(options.label) || name.replace(/[-_]/g, ' '),
      hue: Number.isFinite(options.hue) ? options.hue : hues[options.color] ?? hues[defaults[name]?.color],
      values,
    }]
  })
  const raw_cover = frontmatter.cover
  const cover_url = label(raw_cover?.url) || label(raw_cover)
  const legacy_cover = label(frontmatter.coverImage)
  const cover = cover_url || (legacy_cover && (legacy_cover.includes('/') ? legacy_cover : 'images/' + legacy_cover))
  return {
    facets,
    site: label(frontmatter.site),
    cover: cover ? { url: cover, alt: label(raw_cover?.alt) } : undefined,
  }
}
