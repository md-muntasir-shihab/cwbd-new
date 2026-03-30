/**
 * Mock data for the Universities module.
 * Activated when VITE_USE_MOCK_API=true.
 * Contains 4+ categories and 23 universities with a mix of N/A fields.
 */

import type { UniversityCategorySummary } from '../services/api';

/* ── Category summaries ── */
export const mockUniversityCategories: UniversityCategorySummary[] = [
  { categoryName: 'Individual Admission', order: 1, count: 5, clusterGroups: [] },
  { categoryName: 'Science & Technology', order: 2, count: 8, clusterGroups: [] },
  { categoryName: 'GST (General/Public)', order: 3, count: 5, clusterGroups: [] },
  { categoryName: 'Medical College', order: 4, count: 5, clusterGroups: ['Government Medical', 'Private Medical'] },
];

/* ── Helper: date offset ── */
function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
function pastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/* ── University records ── */
export interface MockUniversity {
  _id: string;
  id: string;
  category: string;
  clusterGroup: string;
  name: string;
  slug: string;
  shortForm: string;
  contactNumber: string | null;
  establishedYear: number | null;
  established: number | null;
  address: string | null;
  email: string | null;
  website: string;
  websiteUrl: string | null;
  admissionWebsite: string;
  admissionUrl: string | null;
  logoUrl: string | null;
  totalSeats: string;
  scienceSeats: string;
  seatsScienceEng: string;
  artsSeats: string;
  seatsArtsHum: string;
  businessSeats: string;
  seatsBusiness: string;
  applicationStart: string;
  applicationStartDate: string;
  applicationEnd: string;
  applicationEndDate: string;
  scienceExamDate: string;
  examDateScience: string;
  artsExamDate: string;
  examDateArts: string;
  businessExamDate: string;
  examDateBusiness: string;
  shortDescription: string;
  description: string;
  examCenters: { city: string; address: string }[];
  units: { name: string; seats: number; examDates: string[]; applicationStart: string; applicationEnd: string; examCenters: { city: string; address: string }[]; notes?: string }[];
  socialLinks: { platform: string; url: string }[];
  isActive: boolean;
  isAdmissionOpen: boolean;
  unitLayout: 'compact';
  slug_display?: string;
}

function u(
  id: number,
  cat: string,
  name: string,
  shortForm: string,
  opts: Partial<MockUniversity> = {},
): MockUniversity {
  const slug = opts.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  return {
    _id: `mock_${id}`,
    id: `mock_${id}`,
    category: cat,
    clusterGroup: '',
    name,
    slug,
    shortForm,
    contactNumber: '+88017' + String(10000000 + id).slice(0, 8),
    establishedYear: 2000 + (id % 20),
    established: 2000 + (id % 20),
    address: `Campus Road ${id}, Dhaka, Bangladesh`,
    email: `info@${slug}.edu.bd`,
    website: `https://${slug}.edu.bd`,
    websiteUrl: `https://${slug}.edu.bd`,
    admissionWebsite: `https://admission.${slug}.edu.bd`,
    admissionUrl: `https://admission.${slug}.edu.bd`,
    logoUrl: null,
    totalSeats: String(500 + id * 50),
    scienceSeats: String(200 + id * 10),
    seatsScienceEng: String(200 + id * 10),
    artsSeats: String(150 + id * 10),
    seatsArtsHum: String(150 + id * 10),
    businessSeats: String(100 + id * 10),
    seatsBusiness: String(100 + id * 10),
    applicationStart: pastDate(30),
    applicationStartDate: pastDate(30),
    applicationEnd: futureDate(15 + id),
    applicationEndDate: futureDate(15 + id),
    scienceExamDate: futureDate(30 + id),
    examDateScience: futureDate(30 + id),
    artsExamDate: futureDate(35 + id),
    examDateArts: futureDate(35 + id),
    businessExamDate: futureDate(40 + id),
    examDateBusiness: futureDate(40 + id),
    shortDescription: `${name} is a leading institution in Bangladesh.`,
    description: `${name} (${shortForm}) — a comprehensive university offering programs in Science, Arts and Business studies.`,
    examCenters: [
      { city: 'Dhaka', address: `Dhaka Center ${id}` },
      { city: 'Chittagong', address: `CTG Center ${id}` },
    ],
    units: [],
    socialLinks: [],
    isActive: true,
    isAdmissionOpen: true,
    unitLayout: 'compact',
    ...opts,
  };
}

export const mockUniversities: MockUniversity[] = [
  // Individual Admission (5)
  u(1, 'Individual Admission', 'Dhaka University', 'DU'),
  u(2, 'Individual Admission', 'Jahangirnagar University', 'JU', { address: 'Savar, Dhaka' }),
  u(3, 'Individual Admission', 'Rajshahi University', 'RU', { logoUrl: null, email: null }),
  u(4, 'Individual Admission', 'Chittagong University', 'CU', { businessExamDate: '', examDateBusiness: '', seatsBusiness: 'N/A', businessSeats: 'N/A' }),
  u(5, 'Individual Admission', 'Khulna University', 'KhU', { applicationEnd: '', applicationEndDate: '' }),

  // Science & Technology (8)
  u(6, 'Science & Technology', 'Bangladesh University of Engineering and Technology', 'BUET', {
    establishedYear: 1962,
    established: 1962,
    address: 'Palashi, Dhaka',
  }),
  u(7, 'Science & Technology', 'Rajshahi University of Engineering & Technology', 'RUET', {
    establishedYear: 1964,
    established: 1964,
    address: 'Kazla, Rajshahi',
  }),
  u(8, 'Science & Technology', 'Khulna University of Engineering & Technology', 'KUET', {
    establishedYear: 1974,
    established: 1974,
    address: 'Fulbarigate, Khulna',
    contactNumber: null,
  }),
  u(9, 'Science & Technology', 'Chittagong University of Engineering & Technology', 'CUET', {
    establishedYear: 1968,
    established: 1968,
    address: 'Raozan, Chattogram',
    artsExamDate: '',
    examDateArts: '',
    artsSeats: 'N/A',
    seatsArtsHum: 'N/A',
  }),
  u(10, 'Science & Technology', 'Shahjalal University of Science and Technology', 'SUST', {
    establishedYear: 1986,
    established: 1986,
    address: 'Kumargaon, Sylhet',
  }),
  u(11, 'Science & Technology', 'Dhaka University of Engineering & Technology', 'DUET', {
    establishedYear: 1980,
    established: 1980,
    address: 'Gazipur',
    websiteUrl: null,
    website: '',
  }),
  u(12, 'Science & Technology', 'Islamic University of Technology', 'IUT', {
    establishedYear: 1981,
    established: 1981,
    address: 'Board Bazar, Gazipur',
  }),
  u(13, 'Science & Technology', 'Hajee Mohammad Danesh Science & Technology University', 'HSTU', {
    establishedYear: 1999,
    established: 1999,
    address: 'Dinajpur',
    email: null,
  }),

  // GST (General/Public) (5)
  u(14, 'GST (General/Public)', 'National University', 'NU'),
  u(15, 'GST (General/Public)', 'Bangladesh Open University', 'BOU', { shortDescription: '' }),
  u(16, 'GST (General/Public)', 'Comilla University', 'CoU'),
  u(17, 'GST (General/Public)', 'Jagannath University', 'JnU', { establishedYear: null, established: null }),
  u(18, 'GST (General/Public)', 'Begum Rokeya University', 'BRUR'),

  // Medical College (5)
  u(19, 'Medical College', 'Dhaka Medical College', 'DMC', { clusterGroup: 'Government Medical' }),
  u(20, 'Medical College', 'Sir Salimullah Medical College', 'SSMC', { clusterGroup: 'Government Medical', examCenters: [] }),
  u(21, 'Medical College', 'Chittagong Medical College', 'CMC', { clusterGroup: 'Government Medical' }),
  u(22, 'Medical College', 'Ibne Sina Medical College', 'ISMC', { clusterGroup: 'Private Medical', admissionUrl: null, admissionWebsite: '' }),
  u(23, 'Medical College', 'Popular Medical College', 'PMC', { clusterGroup: 'Private Medical', totalSeats: 'N/A', scienceSeats: 'N/A', seatsScienceEng: 'N/A' }),
];

/* ── Mock service functions (used when VITE_USE_MOCK_API=true) ── */

export function mockGetUniversityCategories() {
  return mockUniversityCategories;
}

export function mockGetUniversities(params: Record<string, string | number | undefined>) {
  const category = String(params.category || '');
  const clusterGroup = String(params.clusterGroup || '');
  const q = String(params.q || '').toLowerCase();
  const sort = String(params.sort || 'closing_soon');
  const page = Number(params.page || 1);
  const limit = Number(params.limit || 300);

  let filtered = mockUniversities.filter((u) => u.isActive);
  if (category && category.toLowerCase() !== 'all') filtered = filtered.filter((u) => u.category === category);
  if (clusterGroup) filtered = filtered.filter((u) => u.clusterGroup === clusterGroup);
  if (q) filtered = filtered.filter((u) => u.name.toLowerCase().includes(q) || u.shortForm.toLowerCase().includes(q));

  if (sort === 'name_asc') filtered.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'name_desc') filtered.sort((a, b) => b.name.localeCompare(a.name));

  const total = filtered.length;
  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit);

  return { universities: items, items, page, limit, total };
}

export function mockGetUniversityBySlug(slug: string) {
  const found = mockUniversities.find((u) => u.slug === slug);
  if (!found) throw { response: { status: 404 } };
  return found;
}
