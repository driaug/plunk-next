import {useActiveProject} from '../lib/contexts/ActiveProjectProvider';
import {useUser} from '../lib/hooks/useUser';
import {
  Activity,
  BarChart3,
  ChevronDown,
  FileText,
  Layers,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Plus,
  Settings,
  User,
  Users,
  Workflow
} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {useEffect, useRef, useState} from 'react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{className?: string}>;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const navigation: NavSection[] = [
  {
    items: [
      {name: 'Dashboard', href: '/', icon: LayoutDashboard},
      {name: 'Contacts', href: '/contacts', icon: Users},
      {name: 'Segments', href: '/segments', icon: Layers},
      {name: 'Activity', href: '/activity', icon: Activity},
      {name: 'Analytics', href: '/analytics', icon: BarChart3},
    ],
  },
  {
    title: 'Automations',
    items: [
      {name: 'Templates', href: '/templates', icon: FileText},
      {name: 'Workflows', href: '/workflows', icon: Workflow},
    ],
  },
  {
    title: 'Campaigns',
    items: [{name: 'Campaigns', href: '/campaigns', icon: Megaphone}],
  },
];

export function DashboardLayout({children}: DashboardLayoutProps) {
  const router = useRouter();
  const {data: user} = useUser();
  const {activeProject, availableProjects, setActiveProject} = useActiveProject();
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Handle click outside for project menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (projectMenuRef.current && !projectMenuRef.current.contains(event.target as Node)) {
        setShowProjectMenu(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }

    if (showProjectMenu || showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showProjectMenu, showUserMenu]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('activeProjectId');
    void router.push('/auth/login');
  };

  return (
    <div className="flex h-screen bg-neutral-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-neutral-200 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-neutral-200">
          <h1 className="text-xl font-bold text-neutral-900">Plunk</h1>
        </div>

        {/* Project Switcher */}
        <div className="p-4 border-b border-neutral-200">
          <div className="relative" ref={projectMenuRef}>
            <button
              onClick={() => setShowProjectMenu(!showProjectMenu)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg hover:bg-neutral-50 transition-colors"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
                  {activeProject?.name.charAt(0).toUpperCase() || 'P'}
                </div>
                <span className="font-medium text-neutral-900 truncate">{activeProject?.name || 'Select project'}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-neutral-500 flex-shrink-0" />
            </button>

            {/* Project Dropdown */}
            {showProjectMenu && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg z-50 py-1">
                {availableProjects.map(project => (
                  <button
                    key={project.id}
                    onClick={() => {
                      setActiveProject(project);
                      setShowProjectMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-50 transition-colors"
                  >
                    <div className="h-6 w-6 rounded bg-neutral-900 text-white flex items-center justify-center text-xs font-medium">
                      {project.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-neutral-900">{project.name}</span>
                    {activeProject?.id === project.id && (
                      <div className="ml-auto h-1.5 w-1.5 rounded-full bg-neutral-900" />
                    )}
                  </button>
                ))}
                <div className="border-t border-neutral-200 my-1" />
                <Link
                  href="/projects/create"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-50 transition-colors text-neutral-700"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create project</span>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {navigation.map((section, sectionIndex) => (
            <div key={sectionIndex} className={sectionIndex > 0 ? 'mt-6' : ''}>
              {section.title && (
                <p className="px-3 mb-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {section.title}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map(item => {
                  const isActive = router.pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-neutral-700  ${
                        isActive ? 'bg-neutral-100' : 'hover:bg-neutral-50 hover:text-neutral-900'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Settings & User Menu */}
        <div className="border-t border-neutral-200 p-3 space-y-1">
          <Link
            href="/settings"
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-neutral-700  ${
              router.pathname.startsWith('/settings') ? 'bg-neutral-100' : 'hover:bg-neutral-50 hover:text-neutral-900'
            }`}
          >
            <Settings className="h-5 w-5" />
            Settings
          </Link>

          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
            >
              <User className="h-5 w-5" />
              <span className="flex-1 text-left truncate">{user?.email}</span>
              <ChevronDown className="h-4 w-4 text-neutral-500" />
            </button>

            {/* User Dropdown */}
            {showUserMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-neutral-200 rounded-lg shadow-lg z-50 py-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-50 transition-colors text-red-600"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
