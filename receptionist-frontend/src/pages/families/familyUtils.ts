export const formatFamilyCode = (familyId: number) => `FAM${String(familyId).padStart(6, '0')}`;

export const FAMILY_TYPES = ['Nuclear Family', 'Extended Family', 'Single Parent', 'Joint Family', 'Other'];

const SPOUSE_TERMS = ['spouse', 'wife', 'husband'];
const CHILD_TERMS = ['son', 'daughter', 'child'];

export type RelationshipBucket = 'head' | 'spouse' | 'child' | 'other';

// Categorizes a member's free-text relationship_to_head into one of the 4 roster legend
// buckets (Head of Family/Spouse/Children/Other Members) for badge coloring — "Self" for the
// head is always derived from head_patient_id, never stored, since it's implied by that pointer.
export const classifyRelationship = (isHead: boolean, relationshipToHead: string | null): RelationshipBucket => {
  if (isHead) return 'head';
  const value = (relationshipToHead ?? '').trim().toLowerCase();
  if (SPOUSE_TERMS.includes(value)) return 'spouse';
  if (CHILD_TERMS.includes(value)) return 'child';
  return 'other';
};

export const displayRelationship = (isHead: boolean, relationshipToHead: string | null) => (isHead ? 'Self' : relationshipToHead || '—');

export const RELATIONSHIP_BUCKET_LABEL: Record<RelationshipBucket, string> = {
  head: 'Head of Family',
  spouse: 'Spouse',
  child: 'Child',
  other: 'Other Member',
};

export const RELATIONSHIP_BUCKET_BADGE: Record<RelationshipBucket, string> = {
  head: 'badge-blue',
  spouse: 'badge-amber',
  child: 'badge-green',
  other: 'badge-purple',
};
