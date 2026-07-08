// The RENTL Application Template's fields, shared between seed-template.js
// (manual local seeding) and server.js (auto-seeding on every startup, since
// free hosting can wipe stored data between restarts).

const fid = (slug) => slug; // human-readable field ids, easier to read in exported CSVs
const YES_NO = ['Yes', 'No'];

const adultItemFields = [
  { id: fid('full_name'), type: 'text', label: 'Full Name', placeholder: '', required: true },
  { id: fid('dob'), type: 'date', label: 'Date of Birth', placeholder: '', required: true },
  { id: fid('nationality'), type: 'text', label: 'Nationality', placeholder: '', required: true },
  { id: fid('mobile'), type: 'text', label: 'Mobile Phone Number', placeholder: '', required: true },
  { id: fid('email'), type: 'email', label: 'E-mail address', placeholder: '', required: true },
  { id: fid('smoker'), type: 'radio', label: 'Do you smoke?', required: true, options: YES_NO },
  { id: fid('pets'), type: 'radio', label: 'Do you have any pets?', required: true, options: YES_NO },
  { id: fid('ccj'), type: 'radio', label: 'In the past 6 years, have you had a CCJ, IVA or bankruptcy?', required: true, options: YES_NO },
  { id: fid('credit_score'), type: 'select', label: "Current credit score band (check via Experian, ClearScore, etc.)", required: true, options: ['Very Poor', 'Poor', 'Fair', 'Good', 'Excellent', "Don't know"] },
  { id: fid('employment_status'), type: 'select', label: 'Employment Status', required: true, options: ['Full Time', 'Part Time', 'Self Employed', 'Unemployed', 'Student', 'Retired', 'Benefits'] },
  { id: fid('employer'), type: 'text', label: 'Current or Most Recent Employer', placeholder: '', required: true },
  { id: fid('occupation'), type: 'text', label: 'Occupation / Job Title', placeholder: '', required: true },
  { id: fid('employment_length'), type: 'text', label: 'Length of Employment', placeholder: 'e.g. 2 years 3 months', required: true },
  { id: fid('salary'), type: 'number', label: 'Gross Annual Salary (before tax and deductions)', placeholder: '£', required: true },
  { id: fid('contact_employer'), type: 'radio', label: 'May we contact your employer(s) to verify your employment and stated income?', required: true, options: YES_NO },
  { id: fid('other_income'), type: 'number', label: 'Other Gross Annual Income (from a partner or flatmate)', placeholder: '£', required: false },
  { id: fid('guarantor'), type: 'radio', label: 'Can you provide a working, homeowner, UK based guarantor?', required: true, options: YES_NO },
  { id: fid('criminal_convictions'), type: 'radio', label: 'Do you have any unspent criminal convictions?', required: true, options: YES_NO }
];

const fields = [
  {
    id: fid('applicant_details_heading'),
    type: 'heading',
    label: 'Applicant Details',
    body: 'Please give details for every adult (18 years or older) who will be living at the property. Each adult listed will need to complete full referencing (credit checks, income checks, previous rent payment checks, and references from employers and previous landlords/agents), and provide valid photo ID. Non-UK nationals must also provide their Right to Rent share code.'
  },
  {
    id: fid('adults'),
    type: 'repeater',
    label: 'How many adults (18 yrs or older) are to live at the property?',
    required: true,
    min: 1,
    max: 4,
    itemLabel: 'Adult',
    itemFields: adultItemFields
  },
  {
    id: fid('household_heading'),
    type: 'heading',
    label: 'Property & Household',
    body: ''
  },
  { id: fid('children_count'), type: 'number', label: 'How many children (under 18 yrs old) are to live at the property?', required: true },
  { id: fid('current_address'), type: 'textarea', label: 'Your current address', required: true },
  { id: fid('current_postcode'), type: 'text', label: 'Your current postcode', required: true },
  { id: fid('moved_in_date'), type: 'date', label: 'Date you moved into your current home', required: true },
  { id: fid('reason_moving'), type: 'textarea', label: 'Reason for Moving', required: true },
  { id: fid('move_in_date'), type: 'date', label: 'Date you would like to move into your new home', required: true },
  { id: fid('contact_landlord'), type: 'radio', label: 'May we contact your landlord/letting agent to obtain a reference?', required: true, options: YES_NO },
  { id: fid('rent_arrears'), type: 'radio', label: 'Do you have any outstanding rent arrears?', required: true, options: YES_NO },
  { id: fid('additional_info'), type: 'textarea', label: 'Please provide any additional information that may help us evaluate your application', required: true },
  {
    id: fid('terms_heading'),
    type: 'heading',
    label: 'Terms',
    body: 'The information on this application is true and correct to the best of my knowledge. I hereby give authorisation to verify the details within using a 3rd party referencing provider. Should any results of checks performed by the 3rd party referencing provider contradict the information provided, a deduction may be made from any holding deposit placed to reimburse/indemnify the landlord/agent for direct costs incurred.'
  },
  { id: fid('terms_agree'), type: 'radio', label: 'Do you agree to the terms?', required: true, options: ['Yes, I agree to the terms', 'No, I do not agree to the terms'] }
];

module.exports = { title: 'RENTL Application Template', fields };
