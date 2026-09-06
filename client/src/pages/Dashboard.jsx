import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [lessons, setLessons] = useState([]);
  const [progress, setProgress] = useState([]);
  const [detectionLogs, setDetectionLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };

      if (user.role === 'learner') {
        const lessonsRes = await axios.get('http://localhost:5000/lessons', { headers });
        setLessons(lessonsRes.data.lessons);

        const progressRes = await axios.get(`http://localhost:5000/progress/${user.id}`, { headers });
        setProgress(progressRes.data.progress);
      } else {
        const logsRes = await axios.get(`http://localhost:5000/detection/logs/${user.id}`, { headers });
        setDetectionLogs(logsRes.data.logs);
      }

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getProgressForLesson = (lessonId) => {
    const p = progress.find(p => p.lessonId?._id === lessonId);
    return p ? p : null;
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getCategoryLabel = (category) => {
    if (category === 'alphabets') return 'Alphabets A-Z';
    if (category === 'numbers') return 'Numbers 0-9';
    if (category === 'basic_words') return 'Basic Words';
    return category;
  };

  const getCategoryEmoji = (category) => {
    if (category === 'alphabets') return '🔤';
    if (category === 'numbers') return '🔢';
    if (category === 'basic_words') return '💬';
    return '📚';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-white text-xl">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">

      {/* Navbar */}
      <div className="bg-gray-800 px-6 py-4 flex justify-between items-center shadow-lg">
        <h1 className="text-2xl font-bold text-blue-400">SignBridge</h1>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-white font-semibold">{user.name}</p>
            <p className="text-gray-400 text-sm capitalize">{user.role.replace('_', ' ')}</p>
          </div>
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition duration-200"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Welcome message */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-1">Welcome back, {user.name}!</h2>
          <p className="text-gray-400">
            Last active: {user.lastActive ? new Date(user.lastActive).toLocaleDateString() : 'Today'}
          </p>
        </div>

        {/* LEARNER DASHBOARD */}
        {user.role === 'learner' && (
          <div>
            <button
              onClick={() => navigate('/learn/' + (lessons[0]?._id || ''))}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-xl mb-8 text-lg transition duration-200"
            >
              Start Learning Mode
            </button>

            <h3 className="text-xl font-semibold mb-4">Your Lessons</h3>
            <div className="grid gap-4">
              {lessons.map((lesson, index) => {
                const lessonProgress = getProgressForLesson(lesson._id);
                const isFirst = index === 0;

                return (
                  <div
                    key={lesson._id}
                    className="bg-gray-800 rounded-xl p-6 flex items-center justify-between cursor-pointer hover:bg-gray-700 transition duration-200"
                    onClick={() => navigate(`/learn/${lesson._id}`)}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-4xl">{getCategoryEmoji(lesson.category)}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-lg font-semibold">{getCategoryLabel(lesson.category)}</h4>
                          {isFirst && (
                            <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                              Start Here
                            </span>
                          )}
                        </div>
                        <p className="text-gray-400 text-sm">
                          {lessonProgress
                            ? `${lessonProgress.signsCorrect} out of ${lessonProgress.totalSigns} completed`
                            : `${lesson.signs?.length || 0} signs — not started yet`
                          }
                        </p>
                      </div>
                    </div>
                    <div className="text-blue-400 text-2xl">→</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* DEAF USER DASHBOARD */}
        {user.role === 'deaf_user' && (
          <div>
            <button
              onClick={() => navigate('/detect')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-xl mb-8 text-lg transition duration-200"
            >
              Start Detection Mode
            </button>

            <h3 className="text-xl font-semibold mb-4">Recent Sentences</h3>
            {detectionLogs.length === 0 ? (
              <div className="bg-gray-800 rounded-xl p-6 text-center text-gray-400">
                No sentences yet. Start using Detection Mode to communicate.
              </div>
            ) : (
              <div className="grid gap-3">
                {detectionLogs.map((log) => (
                  <div key={log._id} className="bg-gray-800 rounded-xl p-4 flex justify-between items-center">
                    <p className="text-white font-medium">{log.sentence}</p>
                    <p className="text-gray-400 text-sm">
                      {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}