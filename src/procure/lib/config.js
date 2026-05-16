// Maps vendor names to their icon and palette.
// Extend this as you add real vendors.
export const VENDOR_CONFIG = {
  'Axion Systems':  { icon: 'ti-cloud-computing', bg: '#E6F1FB', color: '#185FA5' },
  'NovaTech Ltd.':  { icon: 'ti-cpu',             bg: '#EAF3DE', color: '#3B6D11' },
  'CoreRoute Inc.': { icon: 'ti-router',          bg: '#FAEEDA', color: '#854F0B' },
  'Proxima SaaS':   { icon: 'ti-puzzle',          bg: '#EEEDFE', color: '#534AB7' },
  'Deltalink Co.':  { icon: 'ti-truck-delivery',  bg: '#F1EFE8', color: '#5F5E5A' },
}

export const DEFAULT_VENDOR_CONFIG = {
  icon: 'ti-building',
  bg: '#F1EFE8',
  color: '#5F5E5A',
}

export const STATUS_BADGE_CLASS = {
  preferred:    'badge-green',
  active:       'badge-blue',
  in_review:    'badge-amber',
  inactive:     'badge-gray',
}

export const STATUS_DOT_CLASS = {
  under_review: 'dot-amber',
  negotiating:  'dot-blue',
  approved:     'dot-green',
  active:       'dot-green',
  draft:        'dot-gray',
}

export const STATUS_LABEL = {
  under_review: 'Under review',
  negotiating:  'Negotiating',
  approved:     'Approved',
  active:       'Active',
  draft:        'Draft',
  preferred:    'Preferred',
  in_review:    'In review',
  inactive:     'Inactive',
}
