export type ExamType = 
  | 'Online Link' 
  | 'PDF Upload' 
  | 'Cloze Test' 
  | 'Error Correction' 
  | 'Parajumble' 
  | 'Comprehension' 
  | 'Bilingual MCQ';

export interface QuizConfig {
  totalTime: number; // in seconds
  marksCorrect: number;
  marksWrong: number; // typically represents a positive value (e.g. 0.5) that gets subtracted, though negative values (-0.5) will also be normalized
  maxQuestions: number;
}

// 1. Cloze Test
export interface ClozeQuestion {
  id: number | string;
  blank_num: number;
  options_en: string[];
  correctIndex: number;
  explanation_en?: string;
}

export interface ClozeQuizData {
  passage: string;
  questions: ClozeQuestion[];
  config?: QuizConfig;
}

// 2. Error Correction
export interface ErrorCorrectionQuestion {
  id: number | string;
  question_en: string;
  options_en: string[];
  correctIndex: number;
  explanation_en?: string;
}

// 3. Parajumble
export interface ParajumbleQuestion {
  id: number | string;
  question_en: string;
  sentences: Record<string, string>; // e.g., { "A": "...", "B": "..." }
  options_en: string[];
  correctIndex: number;
  explanation_en?: string;
}

// 4. Comprehension
export interface ComprehensionQuestion {
  id: number | string;
  question_en: string;
  options_en: string[];
  correctIndex: number;
  explanation_en?: string;
}

export interface ComprehensionQuizData {
  passage: string;
  questions: ComprehensionQuestion[];
  config?: QuizConfig;
}

// 5. Bilingual MCQ
export interface BilingualQuestion {
  id: number | string;
  question_bn?: string;
  options_bn?: string[];
  explanation_bn?: string;
  question_en: string;
  options_en: string[];
  explanation_en?: string;
  correctIndex: number;
}

export interface BilingualQuizData {
  questions: BilingualQuestion[];
  config?: QuizConfig;
}

// Generic wrapping type for Firestore
export interface InteractiveQuizPayload {
  type: ExamType;
  config: QuizConfig;
  passage?: string; // used for Cloze and Comprehension
  questions: any[]; // will hold the respective question arrays
}
