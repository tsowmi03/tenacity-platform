# Registration Flow

How the 6-step student enrollment form works.

## Overview

The registration form guides users through 6 steps to enroll students in tutoring classes. Each step collects specific information and includes animations.

## Customizing Form Options

**Need to change the available years, subjects, or days?**

Edit `src/modules/register/constants/index.tsx`:

- **StudentYearsEnum**: Available school years (currently Year 5-12)
- **Subject**: Available tutoring subjects (Maths, English, etc.)
- **DaysOfWeekEnum**: Available class days (Monday-Friday)

Example:

```typescript
export enum StudentYearsEnum {
  Year5 = "Year 5",
  Year6 = "Year 6",
  // Add or remove years as needed
}

export enum Subject {
  Maths = "Maths",
  English = "English",
  Science = "Science", // Add new subjects here
}
```

## The 6 Steps

### Step 1: Year Selection

- **What it does**: Student selects their school year (Year 5-12)
- **Logic**: Years 11-12 can only pick 1 subject, others can pick multiple
- **Animation**: Educational levels and graduation caps

### Step 2: Subject Selection

- **What it does**: Choose subjects for tutoring
- **Logic**:
  - Years 5-10: Can select multiple subjects
  - Years 11-12: Auto-advance after selecting 1 subject
- **Animation**: Books, pencils, academic subjects

### Step 3: Class Time Slots

- **What it does**: Pick specific class times and days
- **Logic**:
  - Loads available classes from Firebase
  - Must select one class per subject
  - Shows capacity and enrollment info
- **Animation**: Clocks and calendars

### Step 4: Student Information

- **What it does**: Student's personal details
- **Fields**: First name, last name
- **Animation**: Student character studying

### Step 5: Carer Information

- **What it does**: Parent/guardian contact details
- **Fields**:
  - Carer name, email, phone
  - Emergency contact info
- **Animation**: Family and communication

### Step 6: Additional Information

- **What it does**: Final details and submission
- **Fields**:
  - Permission to leave
  - Allergies
  - Additional notes
  - Terms acceptance
- **Animation**: Completion and forms

## Technical Flow

### Form State

Uses React Hook Form to manage all data:

```typescript
// Main form data structure
type EnrolmentFormData = {
  studentFirstName: string;
  studentLastName: string;
  studentYear: StudentYearsEnum;
  studentSubjects: Subject[];
  classes: Class[];
  carerFirstName: string;
  carerLastName: string;
  carerEmail: string;
  carerPhone: string;
  // ... more fields
};
```

### Navigation

- **Forward**: Auto-advance or manual next button
- **Backward**: Previous button (except step 1)
- **Progress bar**: Shows current step (1-6)

### Data Persistence

When form is submitted:

1. Validates all required fields
2. Saves to Firebase `enrolments` collection
3. Redirects to thank you page

## Key Features

### Smart Subject Selection

```typescript
// Years 11-12 can only select 1 subject
const canSelectMultipleSubjects = (year: StudentYearsEnum) => {
  return year !== StudentYearsEnum.Year11 && year !== StudentYearsEnum.Year12;
};
```

### Class Matching

- Filters available classes by student year and subjects
- Shows real-time capacity (enrolled vs. total)
- Prevents overbooking

### Form Validation

- Required field checking
- Email format validation
- Phone number validation
- Terms acceptance required

### Responsive Design

- Split-screen: animation left, form right (desktop)
- Stacked layout on mobile
- Touch-friendly interface

## Database Collections

### `classes` Collection

```javascript
{
  id: "math-year10-monday-4pm",
  type: "Maths",
  day: "Monday",
  startTime: "4:00 PM",
  endTime: "5:30 PM",
  capacity: 12,
  enrolledStudents: []
}
```

### `enrolments` Collection

```javascript
{
  studentFirstName: "John",
  studentYear: "Year 10",
  studentSubjects: ["Maths"],
  classes: [{...}],
  carerEmail: "parent@email.com",
  // ... all form fields
}
```

## Error Handling

- **Validation errors**: Show field-level messages
- **Network errors**: Show retry options
- **Firebase errors**: Log and show user-friendly message
- **Missing data**: Prevent navigation until required fields filled

## Testing the Flow

1. **Start at `/register`**
2. **Step 1**: Pick a year
3. **Step 2**: Select subject(s)
4. **Step 3**: Choose class time
5. **Step 4**: Enter student info
6. **Step 5**: Add carer details
7. **Step 6**: Complete and submit
8. **Check Firebase**: Verify data was saved

The form should guide users smoothly through all steps with clear feedback and validation.
