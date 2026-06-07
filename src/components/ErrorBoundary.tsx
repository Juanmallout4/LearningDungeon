import React from 'react';
import { View, Text, ScrollView } from 'react-native';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("ErrorBoundary caught an error", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <ScrollView style={{ flex: 1, backgroundColor: '#ae1f1f', padding: 20 }}>
                    <Text style={{ fontSize: 24, color: 'white', fontWeight: 'bold' }}>App Crashed</Text>
                    <Text style={{ fontSize: 16, color: 'white', marginTop: 10 }}>{this.state.error && this.state.error.toString()}</Text>
                    <Text style={{ fontSize: 12, color: 'white', marginTop: 10, fontFamily: 'monospace' }}>
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </Text>
                </ScrollView>
            );
        }
        return this.props.children;
    }
}
