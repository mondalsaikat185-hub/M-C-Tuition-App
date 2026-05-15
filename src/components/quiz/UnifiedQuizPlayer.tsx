import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Exam } from '../../pages/Pages';
import { addDoc, collection, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../AuthProvider';

export function UnifiedQuizPlayer({ exam, onBack, isPreview = false }: { exam: Exam, onBack: () => void, isPreview?: boolean }) {
  const { user } = useAuth();
  const [screen, setScreen] = useState<'AGREEMENT' | 'LANDING' | 'QUIZ' | 'RESULT'>('AGREEMENT');
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [lang, setLang] = useState('en');
  const [agreed, setAgreed] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [checkingResult, setCheckingResult] = useState(true);
  const [resultSummary, setResultSummary] = useState<{ score: number, total: number, correct: number, wrong: number, skipped: number } | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const userAnswersRef = useRef(userAnswers);
  useEffect(() => {
    userAnswersRef.current = userAnswers;
  }, [userAnswers]);

  useEffect(() => {
    if (!user || isPreview) {
       setCheckingResult(false);
       return;
    }
    const checkPrevious = async () => {
       if ((exam as any).allowMultipleAttempts) {
          setCheckingResult(false);
          return;
       }
       const q = query(collection(db, 'results'), where('studentId', '==', user.uid), where('examId', '==', exam.id));
       const snap = await getDocs(q);
       if (!snap.empty) {
          setAlreadySubmitted(true);
       }
       setCheckingResult(false);
    };
    checkPrevious();
  }, [user, exam.id]);

  // Anti-cheat listener
  useEffect(() => {
    if (screen !== 'QUIZ') return;

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      alert("Copying is disabled during an active exam.");
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      alert("Right-click is disabled during an active exam.");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
         alert("Warning: Tab switching/leaving the exam window was detected. This action will be reported.");
      }
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [screen]);

  const quizData = useMemo(() => {
    try {
       return JSON.parse(exam.quizData || '[]');
    } catch {
       return [];
    }
  }, [exam.quizData]);

  // Extract questions and config
  const questions = Array.isArray(quizData) ? quizData : quizData.questions || [];
  const passage = !Array.isArray(quizData) ? quizData.passage : '';
  
  // library items might define config on the root level
  const rootConfig = {
     totalTime: (exam as any).timeLimit ? (exam as any).timeLimit * 60 : undefined,
     marksCorrect: (exam as any).marksCorrect,
     marksWrong: (exam as any).marksWrong > 0 ? -(exam as any).marksWrong : (exam as any).marksWrong // ensure it's negative or wait, user specifies +2, -0.5 or just 0.5? Usually 0.5 means deduct 0.5.
  };

  const parsedConfig = (!Array.isArray(quizData) && quizData.config) ? quizData.config : {};
  const config = { 
    totalTime: rootConfig.totalTime ?? 1800, 
    marksCorrect: rootConfig.marksCorrect ?? 2, 
    marksWrong: rootConfig.marksWrong !== undefined ? -Math.abs(rootConfig.marksWrong) : -0.5, 
    ...parsedConfig 
  };

  const startQuiz = () => {
    setScreen('QUIZ');
    
    // Initialize end time if not present
    let endTime = localStorage.getItem(`quiz_endtime_${exam.id}`);
    if (!endTime) {
       endTime = (Date.now() + config.totalTime * 1000).toString();
       localStorage.setItem(`quiz_endtime_${exam.id}`, endTime);
    }
    
    // Initialize answers if present
    const saved = localStorage.getItem(`quiz_answers_${exam.id}`);
    if (saved) {
      try { setUserAnswers(JSON.parse(saved)); } catch (e) {}
    }
  };

  useEffect(() => {
     if (screen === 'QUIZ') {
         localStorage.setItem(`quiz_answers_${exam.id}`, JSON.stringify(userAnswers));
     }
  }, [userAnswers, screen, exam.id]);

  useEffect(() => {
    if (screen === 'QUIZ') {
      const endTimeStr = localStorage.getItem(`quiz_endtime_${exam.id}`);
      if (!endTimeStr) return; // shouldn't happen due to startQuiz
      
      const updateTimer = () => {
         const remaining = Math.max(0, Math.floor((parseInt(endTimeStr) - Date.now()) / 1000));
         setTimeLeft(remaining);
         if (remaining <= 0) {
            handleComplete(userAnswersRef.current);
         }
      };
      
      updateTimer();
      const timer = setInterval(updateTimer, 1000);
      return () => clearInterval(timer);
    }
  }, [screen, exam.id]);

  const handleComplete = async (answers: Record<number, number>) => {
    setScreen('RESULT');
    // Clear local storage
    localStorage.removeItem(`quiz_endtime_${exam.id}`);
    localStorage.removeItem(`quiz_answers_${exam.id}`);
    // Calculate score
    let score = 0;
    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    
    questions.forEach((q: any, i: number) => {
       if (answers[i] !== undefined) {
         if (answers[i] === q.correctIndex) {
            score += config.marksCorrect;
            correct++;
         } else {
            score += config.marksWrong;
            wrong++;
         }
       } else {
         skipped++;
       }
    });

    setResultSummary({
       score,
       total: questions.length * config.marksCorrect,
       correct,
       wrong,
       skipped
    });

    if (user && !isPreview) {
      await addDoc(collection(db, 'results'), {
         studentId: user.uid,
         examId: exam.id,
         examTitle: exam.title,
         score,
         totalPossible: questions.length * config.marksCorrect,
         answers,
         createdAt: serverTimestamp()
      });
    }
  };

  if (checkingResult) {
     return <div className="p-6 text-center">Checking status...</div>;
  }

  if (alreadySubmitted) {
     return (
       <div className="p-6 max-w-2xl mx-auto bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 shadow-[8px_8px_0px_0px_rgba(24,24,27,1)] dark:shadow-[8px_8px_0px_0px_rgba(244,244,245,1)] text-center">
         <h2 className="text-2xl font-black uppercase text-red-600 mb-4">Exam already submitted</h2>
         <p className="mb-6 font-medium">You have already completed this exam.</p>
         <button onClick={onBack} className="bg-zinc-200 dark:bg-zinc-800 font-black uppercase py-4 px-6 border-2 border-zinc-900 dark:border-zinc-100">Return to Dashboard</button>
       </div>
     );
  }

  if (screen === 'AGREEMENT') {
     return (
        <div className="p-6 max-w-2xl mx-auto bg-white dark:bg-zinc-900 border-2 border-red-600 shadow-[8px_8px_0px_0px_rgba(220,38,38,1)]">
           <h2 className="text-2xl font-black uppercase text-red-600 border-b-2 border-red-600 pb-2 mb-4">Exam Guidelines & Anti-Cheat Agreement</h2>
           <ul className="list-disc pl-5 space-y-2 mb-6 font-medium text-sm">
              <li>Do not switch tabs or leave this window. Doing so will be recorded and may result in disqualification.</li>
              <li>Copy-pasting text is strictly prohibited and disabled.</li>
              <li>Right-clicking context menus are disabled.</li>
              <li>Your screen activity is monitored for the duration of the test.</li>
              <li>A dynamic watermark will display your credentials throughout the exam.</li>
           </ul>
           <label className="flex items-center gap-3 bg-red-50 dark:bg-red-950 p-4 border border-red-200 dark:border-red-900 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="w-5 h-5 accent-red-600 text-red-600" />
              <span className="font-bold text-red-900 dark:text-red-100">I agree to abide by the rules and understand the consequences of malpractice.</span>
           </label>
           <div className="mt-6 flex gap-4">
              <button disabled={!agreed} onClick={() => setScreen('LANDING')} className="flex-1 bg-red-600 text-white font-black uppercase py-4 hover:-translate-y-0.5 border-2 border-transparent disabled:opacity-50">Acknowledge</button>
              <button onClick={onBack} className="bg-zinc-200 dark:bg-zinc-800 font-black uppercase py-4 px-6 border-2 border-zinc-900 dark:border-zinc-100">Cancel</button>
           </div>
        </div>
     );
  }

  if (screen === 'LANDING') {
    return (
      <div className="p-6 max-w-2xl mx-auto bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 shadow-[8px_8px_0px_0px_rgba(24,24,27,1)] dark:shadow-[8px_8px_0px_0px_rgba(244,244,245,1)]">
        <h2 className="text-2xl font-black uppercase mb-2">{exam.title}</h2>
        <p className="text-zinc-500 mb-6 font-bold">{exam.examType}</p>
        <div className="bg-zinc-100 dark:bg-zinc-800 p-4 border-2 border-zinc-200 dark:border-zinc-700 mb-6">
           <div className="font-mono text-sm">Questions: {questions.length}</div>
           <div className="font-mono text-sm">Time: {Math.floor(config.totalTime / 60)} minutes</div>
           <div className="font-mono text-sm">Marks: +{config.marksCorrect} / {config.marksWrong}</div>
        </div>
        <div className="flex gap-4">
          <button onClick={startQuiz} className="flex-1 bg-emerald-600 text-white font-bold uppercase py-3 border-2 border-transparent hover:-translate-y-0.5 transition-transform shadow-[4px_4px_0px_0px_rgba(4,120,87,1)]">Start Quiz</button>
          <button onClick={onBack} className="bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white font-bold uppercase py-3 px-6 border-2 border-zinc-900 dark:border-zinc-100 hover:-translate-y-0.5 transition-transform shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]">Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto relative select-none">
       {screen === 'QUIZ' && (
          <div className="pointer-events-none fixed flex flex-col items-center justify-center opacity-[0.03] dark:opacity-[0.05] w-full h-full z-0 transform -rotate-45" style={{ top: 0, left: 0 }}>
             {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="text-4xl font-black whitespace-nowrap mb-12">
                   {user?.fullName || user?.displayName} • {user?.email} • {new Date().toISOString().split('T')[0]}
                </div>
             ))}
          </div>
       )}
       
       <div className="bg-zinc-200 dark:bg-zinc-800 p-4 font-black uppercase text-xl sticky top-0 z-10 border-b-4 border-zinc-900 dark:border-zinc-100 flex justify-between relative">
          <div>Time Left: {Math.floor(timeLeft / 3600) > 0 ? `${Math.floor(timeLeft / 3600)}:${Math.floor((timeLeft % 3600) / 60).toString().padStart(2, '0')}:${(timeLeft % 60).toString().padStart(2, '0')}` : `${Math.floor(timeLeft / 60).toString().padStart(2, '0')}:${(timeLeft % 60).toString().padStart(2, '0')}`}</div>
          {exam.examType?.includes('Bilingual') && (
            <select value={lang} onChange={e => setLang(e.target.value)} className="text-sm p-1 ml-4 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border-2 border-zinc-900 dark:border-zinc-100">
               <option value="en">English</option>
               <option value="bn">বাংলা</option>
            </select>
          )}
       </div>
       
       <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          {screen === 'RESULT' && resultSummary && (
             <div className="md:col-span-2 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-600 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="text-center md:text-left">
                  <h3 className="text-xl font-black text-blue-900 dark:text-blue-100 uppercase mb-1">Your Score</h3>
                  <div className="text-4xl font-black text-blue-600">{resultSummary.score} <span className="text-xl text-blue-400">/ {resultSummary.total}</span></div>
                </div>
                <div className="flex gap-4 sm:gap-8 justify-center">
                   <div className="text-center">
                      <div className="text-2xl font-black text-emerald-600">{resultSummary.correct}</div>
                      <div className="text-xs font-bold uppercase opacity-60">Correct</div>
                   </div>
                   <div className="text-center">
                      <div className="text-2xl font-black text-red-600">{resultSummary.wrong}</div>
                      <div className="text-xs font-bold uppercase opacity-60">Wrong</div>
                   </div>
                   <div className="text-center">
                      <div className="text-2xl font-black text-zinc-500">{resultSummary.skipped}</div>
                      <div className="text-xs font-bold uppercase opacity-60">Skipped</div>
                   </div>
                </div>
             </div>
          )}

          {passage && (
             <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-4 h-max sticky top-20">
                <h3 className="font-black uppercase mb-4 border-b-2 border-zinc-200 pb-2">Passage</h3>
                <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed">{passage}</div>
             </div>
          )}

          <div className={passage ? "md:col-span-1" : "md:col-span-2"}>
             {questions.map((q: any, i: number) => {
               const qText = (lang === 'bn' && q.question_bn) ? q.question_bn : q.question_en;
               const opts = (lang === 'bn' && q.options_bn && q.options_bn.length) ? q.options_bn : q.options_en;

               return (
                 <div key={i} className="mb-6 bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,244,245,1)]">
                    <h4 className="font-bold text-lg mb-4 whitespace-pre-wrap leading-relaxed">Q{i+1}. {qText}</h4>
                    {q.sentences && (
                       <div className="mb-4 space-y-2 bg-blue-50 dark:bg-blue-950 p-4 border border-blue-200 dark:border-blue-900">
                          {Object.keys(q.sentences).map(k => (
                            <div key={k} className="flex gap-2 text-sm"><strong className="text-blue-700 dark:text-blue-300">{k}.</strong> <span>{q.sentences[k]}</span></div>
                          ))}
                       </div>
                    )}
                    <div className="space-y-3">
                       {opts?.map((opt: string, optIdx: number) => {
                          const isSelected = userAnswers[i] === optIdx;
                          let bgClass = "bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700";
                          let borderClass = isSelected ? "border-zinc-900 dark:border-zinc-100" : "border-zinc-300 dark:border-zinc-700";
                          
                           let textClass = "";

                          if (screen === 'RESULT') {
                             const isCorrect = optIdx === q.correctIndex;
                             if (isCorrect) {
                                bgClass = "bg-emerald-100 dark:bg-emerald-900/50 border-emerald-500 font-bold text-emerald-900 dark:text-emerald-100";
                                textClass = "text-emerald-900 dark:text-emerald-100";
                             } else if (isSelected && !isCorrect) {
                                bgClass = "bg-red-100 dark:bg-red-900/50 border-red-500 text-red-900 dark:text-red-100 line-through";
                                textClass = "text-red-900 dark:text-red-100";
                             }
                          } else if (isSelected) {
                             bgClass = "bg-zinc-200 dark:bg-zinc-700";
                          }

                          return (
                            <div 
                              key={optIdx} 
                              onClick={() => {
                                 if (screen === 'QUIZ') {
                                    setUserAnswers(p => {
                                       if (p[i] === optIdx) {
                                          const newP = { ...p };
                                          delete newP[i];
                                          return newP;
                                       }
                                       return { ...p, [i]: optIdx };
                                    });
                                 }
                              }}
                              className={`p-3 border-2 cursor-pointer transition-colors ${bgClass} ${borderClass} flex gap-3 text-sm`}
                            >
                               <span className={`font-black opacity-50 ${textClass || "text-zinc-900 dark:text-zinc-100"}`}>{String.fromCharCode(65 + optIdx)}.</span>
                               <span className={textClass || "text-zinc-900 dark:text-zinc-100"}>{opt}</span>
                            </div>
                          )
                       })}
                    </div>
                    {screen === 'RESULT' && (
                       <div className="mt-4 p-4 bg-zinc-100 dark:bg-zinc-800 border-l-4 border-zinc-500 text-sm">
                          <strong>Explanation:</strong> {(lang === 'bn' && q.explanation_bn) ? q.explanation_bn : (q.explanation_en || 'No explanation provided.')}
                       </div>
                    )}
                 </div>
               )
             })}

             {screen === 'QUIZ' && (
                <>
                  <button onClick={() => setShowSubmitConfirm(true)} className="w-full bg-blue-600 text-white font-black uppercase py-4 border-2 border-blue-800 hover:-translate-y-0.5 shadow-[4px_4px_0px_0px_rgba(30,58,138,1)]">
                     Submit Quiz
                  </button>
                  
                  {showSubmitConfirm && (
                    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                      <div className="bg-white dark:bg-zinc-900 border-4 border-black dark:border-white shadow-[8px_8px_0px_black] dark:shadow-[8px_8px_0px_white] p-8 max-w-sm w-full text-center">
                        <h2 className="text-xl font-black mb-4 dark:text-white uppercase">Confirm Submission</h2>
                        <p className="mb-6 font-bold text-zinc-700 dark:text-zinc-300">
                          {(() => {
                            const answeredCount = Object.keys(userAnswers).length;
                            const remaining = questions.length - answeredCount;
                            if (remaining > 0) {
                              return `You have ${remaining} question${remaining > 1 ? 's' : ''} remaining. Do you want to submit?`;
                            }
                            return 'You have answered all questions. Do you want to submit?';
                          })()}
                        </p>
                        <div className="flex gap-4">
                          <button onClick={() => setShowSubmitConfirm(false)} className="flex-1 border-4 border-black dark:border-white bg-zinc-200 dark:bg-zinc-800 font-bold uppercase py-3 dark:text-white">
                            No
                          </button>
                          <button onClick={() => { setShowSubmitConfirm(false); handleComplete(userAnswers); }} className="flex-1 border-4 border-black dark:border-white bg-blue-600 text-white font-black uppercase py-3 shadow-[4px_4px_0px_black] dark:shadow-[4px_4px_0px_white] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all">
                            Yes
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
             )}
             
             {screen === 'RESULT' && (
                <button onClick={onBack} className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-black uppercase py-4 border-2 border-transparent hover:-translate-y-0.5 shadow-[4px_4px_0px_0px_rgba(161,161,170,1)] mt-4">
                   Return to Dashboard
                </button>
             )}
          </div>
       </div>
    </div>
  )
}
