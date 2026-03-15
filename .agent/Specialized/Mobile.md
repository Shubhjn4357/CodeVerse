# Mobile Development & React Native

## Core Framework

- **Primary**: React Native with Expo (if applicable) or CLI.
- **Component Lib**: Use lightweight, performant UI libraries.
- **Navigation**: React Navigation (Native Stack for performance).

## Development Patterns

1. **Platform Detection**: Use `Platform.OS` for specific iOS/Android/Web logic.
2. **Safe Area Views**: Wrap page roots in `SafeAreaView` to handle notches/status bars.
3. **Performance**: Use `FlashList` for heavy lists and avoid deep component nesting.
4. **Offline Support**: Cache data locally using SQLite or MMKV.
