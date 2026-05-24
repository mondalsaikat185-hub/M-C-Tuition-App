/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { useAuth, AuthContext } from "./components/AuthProvider";
import { useTheme } from "./components/ThemeProvider";
import {
  Moon,
  Sun,
  LogIn,
  Loader2,
  MoreVertical,
  LogOut,
  Edit,
  X,
  Bell,
} from "lucide-react";
import { db } from "./lib/firebase";
import { safeToDate } from "./lib/utils";
import {
  doc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
  serverTimestamp,
  getDoc,
  deleteDoc,
} from "firebase/firestore";
import {
  AdminStudents,
  AdminPayments,
  StudentPayments,
  AdminBatches,
  PageHeader,
} from "./pages/Pages";
import { AdminLibrary } from "./pages/AdminLibrary";
import { AdminResults } from "./pages/AdminResults";
import { AdminSettings } from "./pages/AdminSettings";
import { ProfileSetup } from "./pages/ProfileSetup";
import { StudentLibrary } from "./pages/StudentLibrary";
import { cachedGetDocs, cachedGetDoc } from "./lib/cache";

function ProtectedRoute({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const { user, loading } = useAuth();

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );

  if (!user) return <Navigate to="/login" />;

  if (adminOnly && user.role !== "admin") {
    return <Navigate to="/" />;
  }

  if (user.role === "student" && user.status === "rejected") {
    if (window.location.pathname !== "/setup-profile") {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-950">
          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-600 p-8 max-w-md text-center shadow-[8px_8px_0px_0px_rgba(185,28,28,1)]">
            <h2 className="font-black text-red-600 dark:text-red-400 text-xl uppercase mb-2">
              Account Rejected
            </h2>
            <p className="font-bold text-zinc-700 dark:text-zinc-300 mb-6">
              Your account request has been rejected by the administrator. You
              may update your details and submit a new request if you believe
              this was a mistake.
            </p>
            <a
              href="/setup-profile"
              className="inline-block bg-black dark:bg-white text-white dark:text-black font-bold uppercase px-6 py-3 hover:-translate-y-1 transition-transform border-2 border-transparent"
            >
              Re-apply
            </a>
          </div>
        </div>
      );
    }
  }

  if (user.role === "student" && !user.isProfileComplete) {
    if (window.location.pathname !== "/setup-profile") {
      return <Navigate to="/setup-profile" />;
    }
  }

  // Block access to student materials if pending
  if (
    user.role === "student" &&
    user.status === "pending" &&
    window.location.pathname !== "/student" &&
    window.location.pathname !== "/setup-profile"
  ) {
    return <Navigate to="/student" />;
  }

  return <>{children}</>;
}

import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";

function Login() {
  const { user, fbUser, quotaError, signInWithGoogle } = useAuth();

  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    try {
      if (window.self !== window.top) {
        setIsInIframe(true);
      }
    } catch (e) {
      // If cross-origin error, it's definitely in an iframe
      setIsInIframe(true);
    }
  }, []);

  if (user) {
    if (user.role === "admin") return <Navigate to="/admin" />;
    return <Navigate to="/student" />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm p-8 border-2 border-zinc-900 shadow-[8px_8px_0px_0px_rgba(24,24,27,1)] dark:border-zinc-100 dark:shadow-[8px_8px_0px_0px_rgba(244,244,245,1)] bg-white dark:bg-zinc-900 rounded-xl flex flex-col items-center">
        <h1 className="text-2xl font-black mb-2 uppercase italic text-center">
          Tuition Portal
        </h1>
        <p className="text-zinc-500 mb-6 text-center text-sm font-medium">
          অ্যাক্সেস পেতে আপনার গুগল অ্যাকাউন্ট দিয়ে লগইন করুন।
        </p>

        {quotaError && (
          <div className="mb-6 p-4 border bg-red-100 text-red-800 text-sm font-bold w-full text-center">
            {quotaError}
          </div>
        )}

        {isInIframe ? (
          <div className="w-full flex justify-center mt-2 flex-col gap-4 bg-yellow-100 p-4 border border-yellow-500 rounded text-center">
            <p className="text-sm font-bold text-yellow-900">
              গুগল লগইন সিকিউরিটির জন্য এই উইন্ডোতে ব্লক করা হতে পারে।
              <br />
              <br />
              দয়া করে নিচে ক্লিক করে নতুন ট্যাবে খুলুন:
            </p>
            <a
              href={window.location.href}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center bg-blue-600 text-white font-bold py-3 px-4 rounded-lg border-2 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] hover:translate-y-0.5 transition-all text-sm uppercase"
            >
              নতুন ট্যাবে খুলুন (Open in New Tab)
            </a>
          </div>
        ) : (
          <button
            onClick={signInWithGoogle}
            className="flex w-full items-center justify-center gap-2 bg-emerald-500 text-white font-bold py-3 px-4 rounded-lg border-2 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] transition-all uppercase text-sm"
          >
            <LogIn className="w-4 h-4" />
            গুগল দিয়ে লগইন করুন
          </button>
        )}
      </div>
    </div>
  );
}

import { NotificationsPanel } from "./components/NotificationsPanel";

function TopNav() {
  const { theme, setTheme } = useTheme();
  const { user, signOut, updateLocalUser } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [editAddress, setEditAddress] = useState("");
  const [editName, setEditName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchUnreadCount = async () => {
      try {
        const notifQuery = query(
          collection(db, "notifications"),
          orderBy("createdAt", "desc"),
          limit(user.role === "student" ? 30 : 20),
        );
        const snap = await cachedGetDocs(
          notifQuery,
          `notif_count_${user.uid}`,
        );
        let notifs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        if (user.role === "student") {
          notifs = notifs.filter(
            (n: any) =>
              n.senderId === user.uid ||
              n.targetId === user.uid ||
              n.type === "admin_to_all" ||
              (n.type === "admin_to_batch" &&
                n.batchId === (user as any).batchId),
          );
        }
        const unread = notifs.filter(
          (n: any) =>
            n.senderId !== user.uid && !(n.readers || []).includes(user.uid),
        ).length;
        setUnreadCount(unread);
      } catch (err) {
        console.error("Notifications fetch error", err);
      }
    };

    fetchUnreadCount();
    // Poll every 5 minutes — avoids real-time listener which charges reads on every notification change
    const pollInterval = setInterval(fetchUnreadCount, 5 * 60 * 1000);
    return () => clearInterval(pollInterval);
  }, [user?.uid, user?.role, (user as any)?.batchId]);

  const handleEditProfileOpen = () => {
    setEditName(user?.fullName || user?.displayName || "");
    setEditAddress(user?.address || "");
    setShowDropdown(false);
    setShowEditProfile(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        fullName: editName,
        address: editAddress,
      });
      updateLocalUser({
        fullName: editName,
        address: editAddress
      } as any);
      setShowEditProfile(false);
      window.dispatchEvent(
        new CustomEvent("show-custom-alert", {
          detail: "Profile updated successfully!",
        }),
      );
    } catch (err) {
      console.error(err);
      window.dispatchEvent(
        new CustomEvent("show-custom-alert", {
          detail: "Failed to update profile.",
        }),
      );
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <nav className="flex justify-between items-center bg-white dark:bg-zinc-900 border-b-2 border-zinc-900 dark:border-zinc-100 p-4 sticky top-0 z-10">
      <div className="font-black italic uppercase">Tuition Portal</div>
      <div className="flex items-center gap-4">
        {user && (
          <div className="text-xs font-mono hidden sm:block">
            {user.email}{" "}
            <span className="uppercase font-bold text-orange-500 ml-2">
              [{user.role}]
            </span>
          </div>
        )}
        {user && user.role === "admin" && (
          <Link
            to="/admin"
            className="text-xs font-bold uppercase hover:underline text-emerald-600 dark:text-emerald-400"
          >
            Admin Dashboard
          </Link>
        )}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="p-2 border-2 border-zinc-900 dark:border-zinc-100 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
        {user && (
          <>
            <button
              onClick={() => setShowNotifications(true)}
              className="p-2 border-2 border-zinc-900 dark:border-zinc-100 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors relative"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-bounce">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="p-2 border-2 border-zinc-900 dark:border-zinc-100 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {showDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowDropdown(false)}
                  ></div>
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,244,245,1)] z-50 py-1">
                    <button
                      onClick={handleEditProfileOpen}
                      className="w-full text-left px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 font-bold text-sm uppercase"
                    >
                      <Edit className="w-4 h-4" /> Edit Profile
                    </button>
                    <button
                      onClick={() => {
                        setShowDropdown(false);
                        setShowLogoutConfirm(true);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 font-bold text-sm uppercase text-red-600 dark:text-red-400"
                    >
                      <LogOut className="w-4 h-4" /> Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 border-4 border-red-600 dark:border-red-500 p-6 max-w-sm w-full shadow-[8px_8px_0px_0px_rgba(220,38,38,1)] relative">
            <h3 className="font-black text-xl uppercase mb-4 text-red-600 border-b-2 border-red-200 dark:border-red-900 pb-2 flex items-center gap-2">
              <LogOut className="w-6 h-6" /> Confirm Logout
            </h3>
            <p className="font-bold text-sm text-zinc-700 dark:text-zinc-300 mb-6">
              Are you sure you want to log out?
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold border-2 border-zinc-900 dark:border-zinc-100 py-2 hover:-translate-y-0.5 transition-transform shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] dark:shadow-[2px_2px_0px_0px_rgba(244,244,245,1)]"
              >
                Cancel
              </button>
              <button
                onClick={signOut}
                className="flex-1 bg-red-600 text-white font-black uppercase py-2 hover:-translate-y-0.5 transition-transform border-2 border-red-800 shadow-[2px_2px_0px_0px_rgba(153,27,27,1)]"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditProfile && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 border-4 border-black dark:border-zinc-100 p-6 max-w-lg w-full shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] relative">
            <button
              onClick={() => setShowEditProfile(false)}
              className="absolute top-4 right-4 bg-red-100 text-red-600 p-2 border-2 border-red-600 hover:bg-red-200 transition-colors"
              disabled={savingProfile}
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-black text-2xl uppercase mb-6 flex items-center gap-2">
              <Edit className="w-6 h-6" /> Edit Profile
            </h3>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase mb-1 text-zinc-500">
                  Full Name
                </label>
                <input
                  required
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-3 bg-transparent focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-400 font-medium font-mono text-sm"
                  placeholder="Enter your full name"
                  disabled={savingProfile}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1 text-zinc-500">
                  Address Details
                </label>
                <textarea
                  required
                  rows={3}
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-3 bg-transparent focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-400 font-medium font-mono text-sm resize-none"
                  placeholder="Enter your full address"
                  disabled={savingProfile}
                ></textarea>
                <p className="text-[10px] uppercase font-bold text-emerald-500 mt-2">
                  More edit options (e.g., photo upload) will be available
                  later.
                </p>
              </div>
              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-black uppercase py-3 px-6 hover:-translate-y-0.5 transition-transform border-2 border-transparent shadow-[4px_4px_0px_0px_rgba(161,161,170,1)] flex items-center gap-2 disabled:opacity-50"
                >
                  {savingProfile && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNotifications && (
        <NotificationsPanel onClose={() => setShowNotifications(false)} />
      )}
    </nav>
  );
}

import {
  Users,
  BookOpen,
  FileText,
  CreditCard,
  ArrowLeft,
  Layers,
} from "lucide-react";
import { Link } from "react-router-dom";

function AdminDashboard() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black italic uppercase leading-none mb-2">
            Admin Dashboard
          </h2>
          <p className="text-zinc-500 text-sm font-medium">
            Manage your tuition center
          </p>
        </div>
      </div>

      <div className="mb-6 bg-yellow-100 dark:bg-yellow-900/30 border-4 border-yellow-500 p-4">
        <h3 className="font-black text-yellow-800 dark:text-yellow-500 uppercase mb-2">
          🚀 TEST SETUP GUIDE
        </h3>
        <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100 mb-2">
          New to the portal and testing features? You need virtual students!
        </p>
        <ul className="list-disc pl-5 text-sm font-bold text-yellow-800 dark:text-yellow-200 space-y-1 mb-4">
          <li>
            Go to <strong>Students Management</strong> to create virtual
            students and assign them to a Batch.
          </li>
          <li>
            Go to <strong>Payments Management</strong> &rarr; Click their Batch
            to configure their monthly fee.
          </li>
          <li>
            Use the{" "}
            <strong className="text-black dark:text-white bg-yellow-300 dark:bg-yellow-700 px-1">
              SIMULATION MODE
            </strong>{" "}
            toolbar (top) to log in as them and test fee payments!
          </li>
        </ul>
        <Link
          to="/admin/students"
          className="inline-block bg-yellow-500 text-black font-black uppercase text-xs px-4 py-2 hover:-translate-y-0.5 transition-transform border-2 border-yellow-800 shadow-[2px_2px_0px_0px_rgba(133,77,14,1)]"
        >
          Go to Students Management &rarr;
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-min flex-grow">
        {/* Batches Card */}
        <div className="md:col-span-4 bg-indigo-50 dark:bg-indigo-950 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="font-black text-xl text-indigo-900 dark:text-indigo-100 uppercase mb-1">
                  Batches
                </h3>
                <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase">
                  Manage Classes
                </p>
              </div>
              <div className="bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 p-2 border-2 border-indigo-800 dark:border-indigo-200">
                <Layers className="w-6 h-6" />
              </div>
            </div>
            <div className="text-sm font-medium text-indigo-800 dark:text-indigo-200 mb-4">
              Create new batches and delete existing ones.
            </div>
          </div>
          <Link
            to="/admin/batches"
            className="inline-block bg-indigo-500 text-white dark:text-zinc-900 font-bold uppercase text-xs px-4 py-2 hover:-translate-y-0.5 transition-transform border-2 border-zinc-900 dark:border-zinc-100 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,244,245,1)]"
          >
            Manage Batches
          </Link>
        </div>

        {/* Students Card */}
        <div className="md:col-span-4 bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="font-black text-xl uppercase mb-1">Students</h3>
                <p className="text-xs font-bold text-zinc-500 uppercase">
                  Approval & management
                </p>
              </div>
              <div className="bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 p-2 border-2 border-emerald-700 dark:border-emerald-300">
                <Users className="w-6 h-6" />
              </div>
            </div>
            <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-4">
              View pending approvals, assign students to batches, and manage
              profiles.
            </div>
          </div>
          <Link
            to="/admin/students"
            className="inline-block bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold uppercase text-xs px-4 py-2 hover:-translate-y-0.5 transition-transform shadow-[4px_4px_0px_0px_rgba(161,161,170,1)] dark:shadow-[4px_4px_0px_0px_rgba(82,82,91,1)] border-2 border-transparent"
          >
            Manage Students
          </Link>
        </div>

        {/* Notes Library Card */}
        <div className="md:col-span-4 bg-orange-50 dark:bg-orange-950 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="font-black text-xl text-orange-900 dark:text-orange-100 uppercase mb-1">
                  Central Library
                </h3>
                <p className="text-xs font-bold text-orange-700 dark:text-orange-300 uppercase">
                  PDF Notes & Content
                </p>
              </div>
              <div className="bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200 p-2 border-2 border-orange-800 dark:border-orange-200">
                <BookOpen className="w-6 h-6" />
              </div>
            </div>
            <div className="text-sm font-medium text-orange-800 dark:text-orange-200 mb-4">
              Upload notes, generate tracking IDs, and toggle batch visibility.
            </div>
          </div>
          <Link
            to="/admin/library"
            className="inline-block bg-orange-500 text-white font-bold uppercase text-xs px-4 py-2 hover:-translate-y-0.5 transition-transform border-2 border-zinc-900 dark:border-zinc-100 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,244,245,1)]"
          >
            Open Library
          </Link>
        </div>

        {/* Exams Card */}
        <div className="md:col-span-6 bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(161,161,170,1)] dark:shadow-[6px_6px_0px_0px_rgba(82,82,91,1)] flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="font-black text-xl uppercase mb-1">
                  Exam Engine
                </h3>
                <p className="text-xs font-bold text-zinc-400 dark:text-zinc-600 uppercase">
                  Tests & Results
                </p>
              </div>
              <div className="bg-zinc-800 dark:bg-zinc-200 p-2 border-2 border-zinc-700 dark:border-zinc-300">
                <FileText className="w-6 h-6" />
              </div>
            </div>
            <div className="text-sm font-medium text-zinc-300 dark:text-zinc-700 mb-4">
              View student results for the exams.
            </div>
          </div>
          <Link
            to="/admin/results"
            className="inline-block bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-white font-bold uppercase text-xs px-4 py-2 hover:-translate-y-0.5 transition-transform shadow-[4px_4px_0px_0px_rgba(161,161,170,1)] border-2 border-zinc-900 dark:border-zinc-100"
          >
            View Results
          </Link>
        </div>

        {/* Payments Card */}
        <div className="md:col-span-6 bg-yellow-300 dark:bg-yellow-600 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] text-zinc-900 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="font-black text-xl uppercase mb-1">Payments</h3>
                <p className="text-xs font-bold text-yellow-800 dark:text-yellow-950 uppercase">
                  Fees & Tracking
                </p>
              </div>
              <div className="bg-yellow-200 dark:bg-yellow-500 p-2 border-2 border-zinc-900 dark:border-zinc-100">
                <CreditCard className="w-6 h-6" />
              </div>
            </div>
            <div className="text-sm font-medium text-yellow-900 dark:text-yellow-100 mb-4">
              Track student payments, approve or reject submissions, view
              history.
            </div>
          </div>
          <Link
            to="/admin/payments"
            className="inline-block bg-white dark:bg-zinc-900 dark:text-white font-bold uppercase text-xs px-4 py-2 hover:-translate-y-0.5 transition-transform border-2 border-zinc-900 dark:border-zinc-100 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)]"
          >
            Open Payments
          </Link>
        </div>

        {/* Simulator Card */}
        <div className="md:col-span-12 bg-sky-200 dark:bg-sky-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] flex flex-col justify-between">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
            <div className="mb-4 md:mb-0">
              <h3 className="font-black text-xl uppercase mb-1 text-sky-900 dark:text-sky-100">
                Student Simulator
              </h3>
              <p className="text-sm font-medium text-sky-800 dark:text-sky-200 max-w-xl">
                Experience the application exactly as a student would. You can
                select a batch, navigate through exams, notes, and the dashboard
                to verify everything works flawlessly before sharing it with
                students.
              </p>
            </div>
            <Link
              to="/student"
              className="inline-block bg-sky-600 text-white font-bold uppercase text-xs px-6 py-3 hover:-translate-y-0.5 transition-transform border-2 border-zinc-900 dark:border-zinc-100 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,244,245,1)] whitespace-nowrap"
            >
              Launch Simulator
            </Link>
          </div>
        </div>

        {/* Settings Card */}
        <div className="md:col-span-12 lg:col-span-12 bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] flex flex-col justify-between">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
            <div className="mb-4 md:mb-0">
              <h3 className="font-black text-xl text-zinc-900 dark:text-zinc-100 uppercase mb-1">
                Platform Settings
              </h3>
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 max-w-xl">
                Configure UPI Payment details, toggle the payment system, and
                manage other global platform features.
              </p>
            </div>
            <Link
              to="/admin/settings"
              className="inline-block bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold uppercase text-xs px-6 py-3 hover:-translate-y-0.5 transition-transform border-2 border-zinc-900 dark:border-zinc-100 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,244,245,1)] whitespace-nowrap"
            >
              Open Settings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

import { Exam, Note, Payment } from "./pages/Pages";

function StudentDashboard() {
  const { user } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [absentCount, setAbsentCount] = useState<number>(0);
  const [paymentStatus, setPaymentStatus] = useState<{
    status: string;
    label: string;
    color: string;
  }>({
    status: "paid",
    label: "All Paid Up",
    color: "text-emerald-600 dark:text-emerald-400",
  });
  const [showNudge, setShowNudge] = useState(false);

  useEffect(() => {
    // Check nudge popup
    if (
      user &&
      (user as any).showPaymentNudge &&
      (user as any).monthlyFee > 0 &&
      (user as any).pendingMonths > 0
    ) {
      const sessionKey = `nudge_shown_${user.uid}`;
      if (!sessionStorage.getItem(sessionKey)) {
        setShowNudge(true);
        sessionStorage.setItem(sessionKey, "true");
      }
    }

    if (user && (user as any).pendingMonths > 0) {
        // Pending months check moved to second useEffect to prevent flashing
    }
  }, [user?.uid, (user as any)?.showPaymentNudge, (user as any)?.monthlyFee, (user as any)?.pendingMonths]);

  useEffect(() => {
    if (!user?.uid) return;

    const fetchPayment = async () => {
      try {
        let pData: Payment[] = [];
        try {
            const payQ = query(
              collection(db, "payments"),
              where("studentId", "==", user.uid),
              orderBy("createdAt", "desc"),
              limit(1)
            );
            const paySnaps = await cachedGetDocs(payQ, `latest_payment_${user.uid}`);
            paySnaps.forEach((d) =>
              pData.push({ id: d.id, ...d.data() } as Payment),
            );
        } catch (idxErr: any) {
            // Fallback if missing composite index
            const fallbackQ = query(collection(db, "payments"), where("studentId", "==", user.uid), limit(10));
            const paySnaps = await cachedGetDocs(fallbackQ, `all_payments_${user.uid}`);
            paySnaps.forEach((d) =>
              pData.push({ id: d.id, ...d.data() } as Payment),
            );
            pData.sort((a, b) => {
              const getMs = (t: any) => t?.toMillis?.() || (t?.seconds ? t.seconds * 1000 : 0) || 0;
              return getMs(b.createdAt) - getMs(a.createdAt);
            });
            if (pData.length > 1) pData = [pData[0]];
        }

        if (pData.length > 0) {
          const latest = pData[0];
          if (latest.status === "pending") {
            setPaymentStatus({
              status: "pending",
              label: "Pending Review",
              color: "text-yellow-600 dark:text-yellow-400",
            });
          } else if (latest.status === "rejected") {
            setPaymentStatus({
              status: "rejected",
              label: "Rejected",
              color: "text-red-600 dark:text-red-400",
            });
          } else if ((user as any).pendingMonths > 0) {
            setPaymentStatus({
              status: "pending",
              label: "Payment Pending",
              color: "text-red-600 dark:text-red-400",
            });
          } else {
            setPaymentStatus({
              status: "paid",
              label: "All Paid Up",
              color: "text-emerald-600 dark:text-emerald-400",
            });
          }
        } else {
          if ((user as any).pendingMonths > 0) {
            setPaymentStatus({
              status: "pending",
              label: "Payment Pending",
              color: "text-red-600 dark:text-red-400",
            });
          }
        }
      } catch (error) {
        console.error("Dashboard fetch error:", error);
      }
    };
    fetchPayment();

    if (user.batchId) {
      try {
        const fetchAssignments = async () => {
           // 1 read from batches doc instead of up to 500 reads from batchAssignments
           const batchSnap = await cachedGetDoc(doc(db, 'batches', user.batchId!), `batch_${user.batchId}`);
           if (!batchSnap.exists()) return;
           const batchData = batchSnap.data();
           const assignedItemsMap: Record<string, any> = batchData.assignedItemsMap || {};
           const assigns = Object.entries(assignedItemsMap)
             .map(([itemId, assignedAt]) => ({ libraryItemId: itemId, assignedAt: assignedAt ?? null }))
             .sort((a, b) => {
               const getMs = (t: any) => t?.toMillis?.() || (t?.seconds ? t.seconds * 1000 : 0) || 0;
               return getMs(b.assignedAt) - getMs(a.assignedAt);
             });

           const sortedAssignedIds = assigns.map((a) => a.libraryItemId);
           const targetIds = sortedAssignedIds.slice(0, 20);
           if (targetIds.length > 0) {
             const allItems: any[] = [];
             for (let i = 0; i < targetIds.length; i += 10) {
               const chunk = targetIds.slice(i, i + 10);
               const libQ = query(
                 collection(db, "library"),
                 where("__name__", "in", chunk),
               );
               chunk.sort();
               const libSnaps = await cachedGetDocs(libQ, `lib_chunk_${chunk.join('_')}`);
               libSnaps.forEach((d) => allItems.push({ id: d.id, ...d.data() }));
             }
             const accessibleFiles = allItems.filter((i) => !i.isFolder);
             accessibleFiles.sort(
               (a, b) => {
                 const getMs = (t: any) => t?.toMillis?.() || (t?.seconds ? t.seconds * 1000 : 0) || 0;
                 return getMs(b.createdAt) - getMs(a.createdAt);
               }
             );
             const eData = accessibleFiles.filter((i) => i.type === "exam");
             const nData = accessibleFiles.filter(
               (i) => i.type === "note" || i.type === "pdf",
             );
             setExams(eData.slice(0, 3));
             setNotes(nData.slice(0, 5));
           }
        };
        fetchAssignments();
        
        const fetchAttendance = async () => {
           try {
             // Use dynamic import or existing util
             const { getAllAttendanceForBatch } = await import('./lib/exam-session-utils');
             const sBatchAtt = await getAllAttendanceForBatch(user.batchId, 3);
             let recentAbsences = 0;
             let validExamsChecked = 0;
             for (let i = 0; i < sBatchAtt.length && validExamsChecked < 3; i++) {
                const attDateMs = new Date(sBatchAtt[i].date).getTime();
                const msJoined = (user as any).createdAt?.toMillis?.() || ((user as any).createdAt?.seconds ? (user as any).createdAt.seconds * 1000 : 0);
                if (msJoined && attDateMs < msJoined - 86400000) {
                   continue;
                }
                
                validExamsChecked++;
                if (!sBatchAtt[i].presentStudentIds.includes(user.uid)) {
                   recentAbsences++;
                } else {
                   break;
                }
             }
             setAbsentCount(recentAbsences);
           } catch(err) {
             console.error("Attendance fetch error:", err);
           }
        };
        fetchAttendance();
      } catch (error) {
        console.error("Dashboard assignments fetch error:", error);
      }
    }
  }, [user?.uid, user?.batchId]);

  if (user?.status === "pending") {
    return (
      <div className="p-6 max-w-2xl mx-auto mt-8">
        <div className="bg-yellow-50 dark:bg-yellow-950 border-2 border-yellow-600 dark:border-yellow-400 p-6 shadow-[6px_6px_0px_0px_rgba(202,138,4,1)]">
          <h2 className="text-xl font-black uppercase mb-2 text-yellow-800 dark:text-yellow-200">
            Pending Approval
          </h2>
          <p className="text-yellow-700 dark:text-yellow-300 mb-4">
            Your account is created but waiting for admin approval. Please wait
            for the teacher to verify your account and assign you to a batch.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-yellow-600 text-white font-black uppercase px-4 py-2 text-sm hover:-translate-y-0.5 transition-transform border-2 border-yellow-800"
          >
            🔄 Check Approval Status
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col h-full relative">
      {showNudge && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border-4 border-red-600 dark:border-red-500 w-full max-w-sm p-6 text-center transform transition-all scale-100 shadow-[8px_8px_0px_0px_rgba(220,38,38,1)]">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-red-600 dark:border-red-500">
              <span className="font-black text-2xl">!</span>
            </div>
            <h2 className="text-xl font-black uppercase mb-2 text-red-600">
              Payment Reminder
            </h2>
            <p className="mb-4 font-bold text-sm text-zinc-700 dark:text-zinc-300">
              Your monthly salary/fee for{" "}
              <span className="text-red-600 dark:text-red-400">
                {(user as any).pendingMonths} month
                {((user as any).pendingMonths || 1) > 1 ? "s" : ""}
              </span>{" "}
              is pending.
            </p>
            <p className="mb-6 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
              Monthly Fee: ₹{(user as any).monthlyFee}
            </p>
            <button
              onClick={() => setShowNudge(false)}
              className="w-full border-2 border-red-600 bg-red-600 text-white font-bold uppercase py-3 hover:-translate-y-0.5 shadow-[4px_4px_0px_0px_rgba(153,27,27,1)] transition-transform active:translate-y-0 active:shadow-[0px_0px_0px_0px_rgba(153,27,27,1)]"
            >
              I Understand, Close
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6 mt-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black italic uppercase leading-none mb-2">
            Student Dashboard
          </h2>
          <p className="text-zinc-500 text-sm font-medium">
            Welcome back, {user?.fullName || user?.displayName || "Student"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-min flex-grow">
        {/* My Profile Card */}
        <div className="md:col-span-12 bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] flex flex-col md:flex-row gap-6 items-center md:items-start">
          <div className="flex-grow w-full">
            <h3 className="font-black text-xl uppercase mb-4 border-b-2 border-zinc-200 dark:border-zinc-800 pb-2">
              My Profile Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-bold text-zinc-500 uppercase text-xs block">
                  Full Name:
                </span>{" "}
                <div className="font-bold">{user?.fullName || "N/A"}</div>
              </div>
              <div>
                <span className="font-bold text-zinc-500 uppercase text-xs block">
                  Phone:
                </span>{" "}
                <div className="font-bold">{user?.phone || "N/A"}</div>
              </div>
              <div className="sm:col-span-2">
                <span className="font-bold text-zinc-500 uppercase text-xs block">
                  Address:
                </span>{" "}
                <div className="font-bold whitespace-pre-wrap">
                  {user?.address || "N/A"}
                </div>
              </div>
              <div>
                <span className="font-bold text-zinc-500 uppercase text-xs block">
                  Email:
                </span>{" "}
                <div className="font-bold">{user?.email}</div>
              </div>
              <div>
                <span className="font-bold text-zinc-500 uppercase text-xs block">
                  Joined Date:
                </span>{" "}
                <div className="font-bold">{user?.joinDate || "N/A"}</div>
              </div>
              <div className="sm:col-span-2">
                <span className="font-bold text-zinc-500 uppercase text-xs block">
                  Attendance Warning:
                </span>{" "}
                <div className="font-bold">
                  {absentCount > 0 ? (
                    <span className={absentCount >= 3 ? "text-red-500 font-black" : "text-yellow-600"}>
                      You missed {absentCount} of the last 3 live exams!
                    </span>
                  ) : (
                    <span className="text-emerald-500">Perfect recently. Keep it up!</span>
                  )}
                </div>
              </div>
            </div>
            <p className="text-[10px] uppercase font-bold text-red-500 mt-4 border border-red-200 bg-red-50 p-2 dark:bg-red-950/20 dark:border-red-900">
              Note: Profile details are fixed. Contact the admin to update them.
            </p>
          </div>
        </div>

        {/* Active Exams Card */}
        <div className="md:col-span-8 bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(161,161,170,1)] dark:shadow-[6px_6px_0px_0px_rgba(82,82,91,1)]">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="font-black text-xl uppercase mb-1">
                Recent Exams
              </h3>
              <p className="text-xs font-bold text-zinc-400 dark:text-zinc-600 uppercase">
                Latest assigned to you
              </p>
            </div>
            <div className="bg-zinc-800 dark:bg-zinc-200 p-2 border-2 border-zinc-700 dark:border-zinc-300">
              <FileText className="w-6 h-6" />
            </div>
          </div>

          <div className="mb-6 space-y-3">
            {exams.length === 0 ? (
              <div className="text-sm font-medium text-zinc-400 dark:text-zinc-600 italic">
                No exams are currently active for your batch.
              </div>
            ) : (
              exams.map((exam, index) => {
                const timestamp = (exam as any).createdAt;
                const d = safeToDate(timestamp);
                const dateStr = d
                  ? d.toLocaleDateString("en-IN", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })
                  : "";
                return (
                  <div
                    key={exam.id}
                    className="flex justify-between items-center bg-zinc-800 dark:bg-zinc-200 p-3 border border-zinc-700 dark:border-zinc-300 gap-4"
                  >
                    <div className="flex-grow">
                      <div className="font-bold flex items-center gap-2">
                        {exam.title}
                        <span className="text-[9px] bg-zinc-700 dark:bg-zinc-300 px-1 py-0.5 rounded-sm uppercase">
                          {exam.examType || "Exam"}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 dark:text-zinc-500">
                        Added: {dateStr}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 items-end min-w-[80px]">
                      <Link
                        to="/student/library"
                        className="text-[10px] font-bold uppercase underline hover:text-emerald-500 text-emerald-600 dark:text-emerald-400"
                      >
                        Open Exam
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <Link
            to="/student/library"
            className="inline-block bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-white font-bold uppercase text-xs px-4 py-2 hover:-translate-y-0.5 transition-transform shadow-[4px_4px_0px_0px_rgba(212,212,216,1)] dark:shadow-[4px_4px_0px_0px_rgba(63,63,70,1)] border-2 border-transparent"
          >
            Browse All Exams in Library
          </Link>
        </div>

        {/* Notifications / Payment Banner */}
        <div className="md:col-span-4 bg-yellow-300 dark:bg-yellow-600 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] text-zinc-900 flex flex-col justify-between">
          <div>
            <h3 className="font-black text-xl uppercase mb-1">Payments</h3>
            <p className="text-xs font-bold text-yellow-800 dark:text-yellow-950 uppercase">
              Account Status
            </p>
          </div>
          <div className="mt-4 p-4 bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100">
            <div className="text-xs font-bold uppercase text-zinc-500 mb-1">
              Status
            </div>
            <div className={`font-bold uppercase mb-4 ${paymentStatus.color}`}>
              {paymentStatus.label}
            </div>
            <Link
              to="/student/payments"
              className="inline-block bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold uppercase text-xs px-4 py-2 hover:-translate-y-0.5 transition-transform border-2 border-transparent shadow-[4px_4px_0px_0px_rgba(161,161,170,1)]"
            >
              Make Payment
            </Link>
          </div>
        </div>

        {/* Notes Card */}
        <div className="md:col-span-12 bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] mt-4">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="font-black text-xl uppercase mb-1">
                Recent Library Additions
              </h3>
              <p className="text-xs font-bold text-zinc-500 uppercase">
                Latest PDF Notes & Handouts
              </p>
            </div>
            <div className="bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 p-2 border-2 border-orange-700 dark:border-orange-300">
              <BookOpen className="w-6 h-6" />
            </div>
          </div>

          <div className="mb-6 flex flex-wrap gap-4">
            {notes.length === 0 ? (
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 italic">
                No active notes available right now.
              </div>
            ) : (
              notes.map((note, index) => {
                const timestamp = (note as any).createdAt;
                const d = safeToDate(timestamp);
                const dateStr = d
                  ? d.toLocaleDateString("en-IN", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })
                  : "";
                return (
                  <Link
                    to="/student/library"
                    key={note.id}
                    className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 p-3 hover:-translate-y-1 transition-transform min-w-[200px] flex flex-col justify-between"
                  >
                    <div className="font-bold text-orange-900 dark:text-orange-50">
                      {note.title}
                    </div>
                    <div className="flex justify-between items-end mt-2">
                      <div className="text-[10px] text-zinc-500 font-bold uppercase">
                        {dateStr}
                      </div>
                      <div className="text-[10px] text-orange-600 dark:text-orange-400 uppercase font-bold">
                        Open In Library
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          <Link
            to="/student/library"
            className="inline-block bg-orange-500 text-white font-bold uppercase text-xs px-4 py-2 hover:-translate-y-0.5 transition-transform shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] border-2 border-zinc-900 dark:border-zinc-100"
          >
            Browse Library
          </Link>
        </div>
      </div>
    </div>
  );
}

function StudentSimulatorWrapper() {
  const authCtx = React.useContext(AuthContext);
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
  const [simulatedBatchId, setSimulatedBatchId] = useState(
    localStorage.getItem("simulatedBatchId") || "",
  );
  const [batchStudents, setBatchStudents] = useState<any[]>([]);
  const [simulatedStudentId, setSimulatedStudentId] = useState(
    localStorage.getItem("simulatedStudentId") || "",
  );
  const [simulatedStudentData, setSimulatedStudentData] = useState<any>(null);

  useEffect(() => {
    if (authCtx.user?.role !== "admin") return;
    const fetchBatches = async () => {
      const q = query(collection(db, "batches"));
      const snaps = await cachedGetDocs(q, "all_batches");
      const b: any[] = [];
      snaps.forEach((d: any) => b.push({ id: d.id, name: d.data().name }));
      setBatches(b);
      if (b.length > 0 && !simulatedBatchId) {
        setSimulatedBatchId(b[0].id);
        localStorage.setItem("simulatedBatchId", b[0].id);
      }
    };
    fetchBatches();
  }, [authCtx.user?.uid, authCtx.user?.role]);

  useEffect(() => {
    if (!simulatedBatchId || authCtx.user?.role !== "admin") {
      setBatchStudents([]);
      return;
    }
    const fetchStudents = async () => {
      try {
        const q = query(
          collection(db, "users"),
          where("batchId", "==", simulatedBatchId),
        );
        const snaps = await cachedGetDocs(q, `batch_students_${simulatedBatchId}`);
        const students: any[] = [];
        snaps.forEach((d: any) => {
          if (d.data().role !== "admin") {
            students.push({ id: d.id, ...d.data() });
          }
        });
        setBatchStudents(students);
        if (!students.some((s) => s.id === simulatedStudentId)) {
          setSimulatedStudentId("");
          setSimulatedStudentData(null);
        }
      } catch (err) {
        console.error("Error fetching students for simulation:", err);
      }
    };
    fetchStudents();
  }, [simulatedBatchId, authCtx.user?.role]);

  useEffect(() => {
    if (!simulatedStudentId || authCtx.user?.role !== "admin") {
      setSimulatedStudentData(null);
      return;
    }
    const fetchStudentData = async () => {
      const docSnap = await getDoc(doc(db, "users", simulatedStudentId));
      if (docSnap.exists()) {
        setSimulatedStudentData(docSnap.data());
      } else {
        setSimulatedStudentData(null);
      }
    };
    fetchStudentData();
  }, [simulatedStudentId, authCtx.user?.role]);

  if (authCtx.user?.role !== "admin") {
    return <Outlet />;
  }

  const simulatedUser = simulatedStudentData
    ? {
        ...simulatedStudentData,
        uid: simulatedStudentId,
        isSimulatedAdmin: true,
      }
    : {
        ...authCtx.user,
        role: "student",
        batchId: simulatedBatchId,
        isSimulatedAdmin: true,
      };

  return (
    <>
      <div className="bg-yellow-400 text-yellow-900 border-b-4 border-yellow-500 px-4 py-2 flex flex-col items-center justify-between font-bold text-xs uppercase shadow-md relative z-50 gap-2">
        <div className="flex w-full items-center justify-between flex-wrap gap-2 mb-2 sm:mb-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-yellow-900 text-yellow-400 px-2 py-1">
              Simulation Mode
            </span>
            <span>Batch:</span>
            <select
              value={simulatedBatchId}
              onChange={(e) => {
                setSimulatedBatchId(e.target.value);
                localStorage.setItem("simulatedBatchId", e.target.value);
                setSimulatedStudentId("");
                localStorage.removeItem("simulatedStudentId");
              }}
              className="bg-yellow-50 border-2 border-yellow-600 p-1 outline-none font-bold text-yellow-900 shadow-[2px_2px_0px_0px_rgba(161,98,7,1)]"
            >
              <option value="">-- No Batch --</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <span className="ml-2 hidden sm:inline">Student:</span>
            <select
              value={simulatedStudentId}
              onChange={(e) => {
                setSimulatedStudentId(e.target.value);
                localStorage.setItem("simulatedStudentId", e.target.value);
              }}
              className="bg-yellow-50 border-2 border-yellow-600 p-1 outline-none font-bold text-yellow-900 shadow-[2px_2px_0px_0px_rgba(161,98,7,1)]"
            >
              <option value="">-- Default Admin UID --</option>
              {batchStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName || s.email}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <Link
              to="/admin"
              className="bg-zinc-900 text-white px-3 py-1.5 border border-zinc-700 hover:-translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] transition-transform whitespace-nowrap"
            >
              Exit Simulator
            </Link>
          </div>
        </div>
        {simulatedStudentId && (
          <div
            className="w-full text-left text-yellow-800 bg-yellow-500/30 p-1 mt-1 border border-yellow-500 flex items-center justify-between"
            style={{ fontSize: "10px" }}
          >
            <span>
              ℹ️ Working as:{" "}
              {batchStudents.find((s) => s.id === simulatedStudentId)?.fullName}{" "}
              - Payments and quizzes submitted now will create real records for
              this student.
            </span>
          </div>
        )}
      </div>
      <AuthContext.Provider value={{ ...authCtx, user: simulatedUser as any }}>
        <Outlet />
      </AuthContext.Provider>
    </>
  );
}

function RootRoute() {
  const { user, loading } = useAuth();

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (!user) return <Navigate to="/login" />;
  if (user.role === "admin") return <Navigate to="/admin" />;
  return <Navigate to="/student" />;
}

function GlobalAlert() {
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  useEffect(() => {
    const handleAlert = (e: any) => {
      setAlertMsg(e.detail);
    };
    window.addEventListener("show-custom-alert", handleAlert);
    return () => window.removeEventListener("show-custom-alert", handleAlert);
  }, []);

  if (!alertMsg) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-zinc-900 border-4 border-zinc-900 dark:border-zinc-100 p-6 max-w-sm w-full shadow-[8px_8px_0px_0px_rgba(24,24,27,1)] dark:shadow-[8px_8px_0px_0px_rgba(244,244,245,1)]">
        <h3 className="font-black text-xl uppercase mb-4 text-zinc-900 dark:text-zinc-100 border-b-2 border-zinc-200 dark:border-zinc-800 pb-2">
          Notice
        </h3>
        <p className="font-bold text-sm text-zinc-700 dark:text-zinc-300 mb-6 whitespace-pre-wrap">
          {alertMsg}
        </p>
        <button
          onClick={() => setAlertMsg(null)}
          className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-black uppercase py-3 hover:-translate-y-0.5 transition-transform"
        >
          OK
        </button>
      </div>
    </div>
  );
}

import { ReloadPrompt } from "./components/ReloadPrompt";
import { InstallPrompt } from "./components/InstallPrompt";

export default function App() {
  const { quotaError } = useAuth();

  if (quotaError) {
    const isQuotaError = quotaError?.includes('লিমিট') || quotaError?.includes('Quota');
    const errorTitle = isQuotaError ? 'Database Limit Reached' : 'Connection Error';

    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white dark:bg-zinc-900 border-4 border-red-600 p-8 max-w-md shadow-[8px_8px_0px_0px_rgba(220,38,38,1)]">
          <h1 className="text-2xl font-black text-red-600 uppercase mb-4">{errorTitle}</h1>
          <p className="font-bold text-zinc-700 dark:text-zinc-300 mb-6 text-sm whitespace-pre-wrap leading-relaxed">
            {quotaError}
          </p>
          {isQuotaError && (
            <p className="text-xs font-bold text-zinc-500 mb-6">
              Firebase free tier daily read limit has been exhausted (50,000 reads). 
              This limit resets daily at 12:00 AM Pacific Time.
            </p>
          )}
          <button 
             onClick={() => window.location.reload()}
             className="w-full bg-red-600 text-white font-black uppercase py-3 hover:-translate-y-1 transition-transform border-2 border-red-600"
          >
             Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <ReloadPrompt />
      <InstallPrompt />
      <GlobalAlert />
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans flex flex-col">
        <TopNav />
        <main className="flex-1">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/setup-profile"
              element={
                <ProtectedRoute>
                  <ProfileSetup />
                </ProtectedRoute>
              }
            />

            {/* Admin Routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute adminOnly>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/students"
              element={
                <ProtectedRoute adminOnly>
                  <AdminStudents />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/batches"
              element={
                <ProtectedRoute adminOnly>
                  <AdminBatches />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/library"
              element={
                <ProtectedRoute adminOnly>
                  <AdminLibrary />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/results/:examId?"
              element={
                <ProtectedRoute adminOnly>
                  <AdminResults />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/payments"
              element={
                <ProtectedRoute adminOnly>
                  <AdminPayments />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <ProtectedRoute adminOnly>
                  <AdminSettings />
                </ProtectedRoute>
              }
            />

            {/* Student Routes */}
            <Route path="/" element={<RootRoute />} />
            <Route path="/student" element={<StudentSimulatorWrapper />}>
              <Route
                index
                element={
                  <ProtectedRoute>
                    <StudentDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="library"
                element={
                  <ProtectedRoute>
                    <StudentLibrary />
                  </ProtectedRoute>
                }
              />
              <Route
                path="payments"
                element={
                  <ProtectedRoute>
                    <StudentPayments />
                  </ProtectedRoute>
                }
              />
              <Route
                path="exams"
                element={<Navigate to="/student/library" replace />}
              />
            </Route>
          </Routes>
        </main>
      </div>
    </Router>
  );
}
