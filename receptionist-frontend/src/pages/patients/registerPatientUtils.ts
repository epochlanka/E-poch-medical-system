export const BLOOD_GROUP_LETTERS = ['A', 'B', 'AB', 'O'];
export const RH_FACTORS = [
  { value: '+', label: 'Positive (+)' },
  { value: '-', label: 'Negative (-)' },
];
export const MARITAL_STATUSES = ['Single', 'Married', 'Widowed', 'Divorced'];
export const RELATIONSHIPS_TO_HEAD = ['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Other'];
export const GENDERS = ['Female', 'Male', 'Other'];

export interface RegisterFormState {
  // Step 1: Patient Information
  full_name: string;
  dob: string;
  gender: string;
  idNumber: string;
  isMinor: boolean;
  guardianNic: string;
  nationality: string;
  maritalStatus: string;
  occupation: string;
  employerSchool: string;
  familyMode: 'existing' | 'new';
  familyId: string;
  familyName: string;
  newFamilyName: string;
  relationshipToHead: string;
  isHeadOfFamily: boolean;

  // Step 2: Contact & Address
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  address: string;
  contactNo: string;

  // Step 3: Medical Information
  bloodGroupLetter: string;
  rhFactor: string;
  allergies: string;
  chronicConditions: string;
  currentMedications: string;
}

export const emptyRegisterForm: RegisterFormState = {
  full_name: '',
  dob: '',
  gender: 'Female',
  idNumber: '',
  isMinor: false,
  guardianNic: '',
  nationality: '',
  maritalStatus: '',
  occupation: '',
  employerSchool: '',
  familyMode: 'existing',
  familyId: '',
  familyName: '',
  newFamilyName: '',
  relationshipToHead: '',
  isHeadOfFamily: false,

  phone: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  address: '',
  contactNo: '',

  bloodGroupLetter: '',
  rhFactor: '',
  allergies: '',
  chronicConditions: '',
  currentMedications: '',
};

export const DRAFT_KEY = 'epoch_reception_patient_draft';

export const calculateAgeFromDob = (dob: string) => {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age;
};
