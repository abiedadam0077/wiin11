import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/ai/planner_screen.dart';
import '../../features/bots/bot_details_screen.dart';
import '../../features/bots/bots_screen.dart';
import '../../features/bots/inventory_screen.dart';
import '../../features/settings/skin_manager_screen.dart';
import '../../features/dashboard/dashboard_screen.dart';
import '../../features/servers/server_details_screen.dart';
import '../../features/servers/servers_screen.dart';
import '../../features/settings/settings_detail_screen.dart';
import '../../features/settings/settings_screen.dart';
import '../../features/splash/splash_screen.dart';
import '../../features/tasks/task_builder_screen.dart';
import '../../features/tasks/task_details_screen.dart';
import '../../features/tasks/tasks_screen.dart';
import '../../features/welcome/welcome_screen.dart';
import '../widgets/app_shell.dart';

final appRouterProvider = Provider<GoRouter>((Ref ref) {
  final GoRouter router = createAppRouter();
  ref.onDispose(router.dispose);
  return router;
});

GoRouter createAppRouter({String initialLocation = '/splash'}) => GoRouter(
      initialLocation: initialLocation,
      routes: <RouteBase>[
        GoRoute(path: '/splash', builder: (BuildContext context, GoRouterState state) => const SplashScreen()),
        GoRoute(path: '/welcome', builder: (BuildContext context, GoRouterState state) => const WelcomeScreen()),
        StatefulShellRoute.indexedStack(
          builder: (BuildContext context, GoRouterState state, StatefulNavigationShell shell) => AppShell(navigationShell: shell),
          branches: <StatefulShellBranch>[
            StatefulShellBranch(routes: <RouteBase>[
              GoRoute(path: '/dashboard', pageBuilder: _fadePage((_) => const DashboardScreen())),
            ]),
            StatefulShellBranch(routes: <RouteBase>[
              GoRoute(
                path: '/bots',
                pageBuilder: _fadePage((_) => const BotsScreen()),
                routes: <RouteBase>[
                  GoRoute(path: ':id', pageBuilder: (BuildContext context, GoRouterState state) => _page(state, BotDetailsScreen(botId: state.pathParameters['id'] ?? '')),
                    routes: <RouteBase>[
                      GoRoute(path: 'inventory', pageBuilder: (BuildContext context, GoRouterState state) => _page(state, InventoryScreen(botId: state.pathParameters['id'] ?? ''))),
                    ]),
                ],
              ),
            ]),
            StatefulShellBranch(routes: <RouteBase>[
              GoRoute(
                path: '/tasks',
                pageBuilder: _fadePage((_) => const TasksScreen()),
                routes: <RouteBase>[
                  GoRoute(path: 'create', pageBuilder: _fadePage((_) => const TaskBuilderScreen())),
                  GoRoute(path: 'planner', pageBuilder: _fadePage((_) => const PlannerScreen())),
                  GoRoute(path: ':id', pageBuilder: (BuildContext context, GoRouterState state) => _page(state, TaskDetailsScreen(taskId: state.pathParameters['id'] ?? ''))),
                ],
              ),
            ]),
            StatefulShellBranch(routes: <RouteBase>[
              GoRoute(
                path: '/servers',
                pageBuilder: _fadePage((_) => const ServersScreen()),
                routes: <RouteBase>[
                  GoRoute(path: ':id', pageBuilder: (BuildContext context, GoRouterState state) => _page(state, ServerDetailsScreen(serverId: state.pathParameters['id'] ?? ''))),
                ],
              ),
            ]),
            StatefulShellBranch(routes: <RouteBase>[
              GoRoute(
                path: '/settings',
                pageBuilder: _fadePage((_) => const SettingsScreen()),
                routes: <RouteBase>[
                  GoRoute(path: 'skins', pageBuilder: _fadePage((_) => const SkinManagerScreen())),
                  GoRoute(path: 'section/:section', pageBuilder: (BuildContext context, GoRouterState state) => _page(state, SettingsDetailScreen(section: state.pathParameters['section'] ?? 'about'))),
                ],
              ),
            ]),
          ],
        ),
      ],
      errorBuilder: (BuildContext context, GoRouterState state) => const RouteErrorScreen(),
    );

GoRouterPageBuilder _fadePage(Widget Function(BuildContext context) builder) =>
    (BuildContext context, GoRouterState state) => _page(state, builder(context));

CustomTransitionPage<void> _page(GoRouterState state, Widget child) => CustomTransitionPage<void>(
      key: state.pageKey,
      child: child,
      transitionDuration: const Duration(milliseconds: 260),
      reverseTransitionDuration: const Duration(milliseconds: 210),
      transitionsBuilder: (BuildContext context, Animation<double> animation, Animation<double> secondaryAnimation, Widget child) {
        final Animation<Offset> slide = Tween<Offset>(begin: const Offset(0, .035), end: Offset.zero).animate(
          CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
        );
        return FadeTransition(opacity: animation, child: SlideTransition(position: slide, child: child));
      },
    );

class RouteErrorScreen extends StatelessWidget {
  const RouteErrorScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: FilledButton.tonal(
            onPressed: () => context.go('/dashboard'),
            child: const Text('MineBot AI'),
          ),
        ),
      );
}
