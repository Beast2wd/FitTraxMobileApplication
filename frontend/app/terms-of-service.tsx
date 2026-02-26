import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useThemeStore } from '../stores/themeStore';
import { useUserStore } from '../stores/userStore';
import * as storage from '../services/storage';

const { width } = Dimensions.get('window');

const TERMS_OF_SERVICE = `FitTrax+ – Terms of Service
Welcome to FitTrax+

Did you know reading Terms of Service won't burn calories—but it can save you headaches later?
While tapping "Accept" is tempting, we encourage you to review this document carefully. Our mission is to support your health journey while delivering a smooth, reliable, and transparent experience with FitTrax+. Track, Transform, Thrive

Acceptance of These Terms

The FitTrax+ website, mobile applications, and related tools (collectively, the "Services") are provided by FitTrax+, Inc. ("FitTrax+," "we," "us," or "our"). These Terms of Service ("Terms"), together with our Privacy Policy and Community Guidelines, govern your access to and use of the Services.

By accessing or using the Services, creating an account, or otherwise indicating acceptance, you agree to be bound by these Terms. If you do not agree, you may not use the Services.

IMPORTANT NOTICE REGARDING DISPUTE RESOLUTION

These Terms include mandatory binding arbitration and a class action waiver. Please review the Dispute Resolution section carefully, as it affects your legal rights.

Eligibility

You must be 18 years of age or older to use FitTrax+.

We do not knowingly collect personal information from individuals under 18. If we learn that an underage user has provided information, we will take appropriate steps to remove such data and close the associated account. FitTrax+ will not sell or willingly distribute personal data to a third party.

You are responsible for ensuring your use of the Services complies with applicable laws in your jurisdiction.

Your Account

To access certain features, you may need to create a FitTrax+ account. You agree to:

• Provide accurate and complete registration information
• Maintain and update your information as needed
• Use only one account for personal use
• Keep your login credentials secure

You are responsible for all activity under your account. Notify FitTrax+ immediately of any unauthorized access or suspected security issues.

You may delete your account at any time. Deleted accounts are generally not recoverable.

Service Changes and Availability

FitTrax+ may update, modify, suspend, or discontinue any part of the Services at any time, including features, pricing, or availability. Updates may be automatic and required for proper functionality.

We are not liable for any modification, suspension, or discontinuation of the Services or any resulting impact.

Updates to These Terms

We may revise these Terms from time to time. Material changes will be communicated in advance. Continued use of the Services after changes take effect constitutes acceptance of the revised Terms.

Content Ownership

FitTrax+ Content

All content made available through the Services—including text, graphics, software, data, nutritional information, and design elements—is owned by FitTrax+ or its licensors and is protected by intellectual property laws.

You may not copy, distribute, modify, reverse engineer, or commercially exploit any FitTrax+ content without permission.

User-Generated Content

Content you submit—such as food logs, activity data, feedback, or comments—remains yours. However, by submitting content, you grant FitTrax+ a worldwide, royalty-free, transferable license to use, store, display, modify, and distribute that content as necessary to operate and improve the Services.

We do not use your content in ways that conflict with our Privacy Policy.

Feedback

Any suggestions, ideas, or feedback you provide may be used by FitTrax+ without obligation or compensation and is treated as non-confidential.

Premium Services

FitTrax+ may offer subscription-based premium features ("Premium Services").

Billing

• Subscriptions may be billed monthly or annually
• Charges occur at the beginning of each billing cycle
• Subscriptions auto-renew unless canceled before renewal
• Refunds are subject to platform and legal limitations

Cancellation

You may cancel through your account settings or the platform (Apple App Store or Google Play) where you subscribed. Access continues through the end of the billing period.

Deleting the app does not cancel your subscription.

Free Trials and Promotions

FitTrax+ may offer free trials or promotional access. Unless canceled before the trial ends, your subscription will convert to a paid plan automatically.

Discount codes are non-transferable, cannot be combined, and must be used before expiration.

Health Disclaimer

FitTrax+ provides general wellness, fitness and nutrition information only.

• We do not provide medical advice
• Always consult a healthcare professional before starting a diet, fitness program and peptide regiment. It's important to emphasize that peptide usage and findings are based on preclinical studies, and more research is needed to conclusively determine the effects and safety of peptides in humans. Any use of peptides should be under the guidance of a healthcare provider to ensure safety and monitor any potential side effects or contraindications.
• The AI peptide section here within this app are for educational purposes only. Always consult with a healthcare provider
• Do not disregard professional medical advice based on app content

Use of the Services does not create a doctor-patient relationship.

Food & Nutrition Accuracy

Nutritional data may come from user submissions, third parties, or automated systems. We do not guarantee accuracy, completeness, allergen safety, or suitability for medical conditions.

You are responsible for verifying food information including but not limited to carbohydrate, calorie, sugar, fat, protein intake and managing allergies or dietary restrictions.

Prohibited Uses

You may not:

• Scrape, mine, or extract data from the Services
• Use automated tools to access content
• Introduce malware or harmful code
• Disrupt platform operations
• Use the Services for unauthorized commercial purposes

Third-Party Services

FitTrax+ may integrate with third-party apps, devices, or services. We are not responsible for their content, accuracy, or availability. Use of third-party services is at your own risk.

Disclaimer of Warranties

The Services are provided "as is" and "as available."
FitTrax+ disclaims all warranties to the maximum extent permitted by law, including implied warranties of fitness, accuracy, or reliability.

Limitation of Liability

To the fullest extent permitted by law, FitTrax+ shall not be liable for indirect, incidental, or consequential damages. Our total liability will not exceed the greater of $500 USD or the amount you paid to FitTrax+ in the previous 12 months.

Indemnification

You agree to indemnify and hold harmless FitTrax+ from claims arising out of your use of the Services, violation of these Terms, or infringement of third-party rights.

Governing Law

These Terms are governed by the laws of the State of New York, without regard to conflict-of-law principles.

Dispute Resolution

All disputes will be resolved through binding individual arbitration, except where prohibited by law. Class actions, jury trials, and representative actions are waived.

You may opt out of arbitration within 30 days of first accepting these Terms by submitting written notice to FitTrax+.

International Users

If you access the Services from outside the United States, you consent to the transfer and processing of data in the U.S. and agree to comply with local laws.

Contact Us

If you have questions or feedback, contact FitTrax+ Support at:

FitTrax+, Inc.
Attn: Legal & Support
Email: support@fittrax.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FitTrax+ Privacy Policy

Last Updated: 1/09/26

FitTrax+ ("FitTrax+," "we," "us," or "our") values your privacy. This Privacy Policy explains how we collect, use, disclose, and protect your information when you access or use the FitTrax+ website, mobile applications, and related services (collectively, the "Services").

By using the Services, you agree to the practices described in this Privacy Policy.

1. Information We Collect

A. Information You Provide Directly

We may collect information you voluntarily provide, including:

• Account registration details (name, email address, login credentials)
• Profile information (age range, height, weight, goals, preferences)
• Food, nutrition, and activity logs
• Subscription and billing information (processed by third-party providers)
• Communications with support or feedback submissions

B. Information Collected Automatically

When you use the Services, we may automatically collect:

• Device information (device type, operating system, app version)
• Usage data (features used, screens viewed, session duration)
• Log data (IP address, time zone, crash reports)
• Cookies and similar technologies (for web-based services)

C. Information from Third Parties

We may receive information from:

• App stores (Apple App Store, Google Play)
• Connected devices or fitness platforms (if you choose to link them)
• Payment processors (confirmation of subscription status only)

We do not receive or store full payment card numbers.

2. How We Use Your Information

We use your information to:

• Provide and operate the Services
• Personalize nutrition and activity tracking
• Display progress, goals, and insights
• Process subscriptions and payments
• Improve features, performance, and user experience
• Communicate service updates and support responses
• Detect fraud, misuse, or security issues
• Comply with legal obligations

3. Health & Nutrition Data

FitTrax+ allows users to enter nutrition, fitness, and wellness information. This data:

• Is used solely to provide app functionality and insights
• Is not medical data under HIPAA
• Is not shared with advertisers for targeting medical conditions

You control what information you enter and may delete it at any time.

4. How We Share Information

We do not sell your personal information.

We may share information only in the following circumstances:

A. Service Providers

With trusted vendors who help us operate the Services, such as:

• Cloud hosting providers
• Payment processors
• Analytics and crash-reporting services

These providers are contractually required to protect your data.

B. Legal & Safety Requirements

We may disclose information if required to:

• Comply with laws, regulations, or legal processes
• Respond to lawful government requests
• Protect the rights, safety, or security of users or FitTrax+

C. Business Transfers

If FitTrax+ is involved in a merger, acquisition, or asset sale, your information may be transferred as part of that transaction.

5. Cookies & Tracking Technologies

FitTrax+ may use cookies, SDKs, and similar technologies to:

• Remember preferences
• Analyze usage trends
• Improve performance and reliability

You can control cookie preferences through your browser or device settings.

6. Data Retention

We retain personal information only as long as necessary to:

• Provide the Services
• Comply with legal obligations
• Resolve disputes and enforce agreements

You may request deletion of your data by deleting your account or contacting support.

7. Your Privacy Choices & Rights

Depending on your location, you may have the right to:

• Access your personal information
• Correct inaccurate data
• Delete your information
• Object to certain processing
• Request data portability

You can manage most information directly within the app.

8. Children's Privacy

FitTrax+ is not intended for individuals under 18.

We do not knowingly collect personal information from children. If we become aware that such information has been collected, we will promptly delete it.

9. Data Security

We implement reasonable administrative, technical, and physical safeguards to protect your information. However, no system is completely secure, and we cannot guarantee absolute security.

10. International Users

If you access FitTrax+ from outside the United States, you consent to the transfer, storage, and processing of your information in the U.S. and other countries where our service providers operate.

11. Third-Party Links & Integrations

The Services may contain links to third-party websites or integrate with third-party services. We are not responsible for their privacy practices. Please review their policies independently.

12. Changes to This Privacy Policy

We may update this Privacy Policy periodically. If changes are material, we will notify you through the Services or by other appropriate means. Continued use after updates constitutes acceptance.

13. Contact Us

If you have questions, concerns, or requests regarding this Privacy Policy, contact us at:

FitTrax+, Inc.
Attn: Privacy Team
Email: support@fittrax.com`;

export default function TermsOfServiceScreen() {
  const { theme } = useThemeStore();
  const { setTosAccepted } = useUserStore();
  const colors = theme.colors;
  const accent = theme.accentColors;
  
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 50;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const handleAccept = async () => {
    if (!isChecked) {
      Alert.alert(
        'Acknowledgment Required',
        'Please check the box to confirm you have read and agree to the Terms of Service and that you are at least 18 years of age.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      // Save TOS acceptance to storage and store
      const acceptanceData = {
        accepted: true,
        acceptedAt: new Date().toISOString(),
        version: '1.0',
      };
      
      await storage.saveTosAcceptance(acceptanceData);
      setTosAccepted(acceptanceData);
      
      // Navigate to onboarding/profile setup
      router.replace('/onboarding');
    } catch (error) {
      console.error('Error saving TOS acceptance:', error);
      Alert.alert('Error', 'Failed to save your acceptance. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecline = () => {
    Alert.alert(
      'Terms Required',
      'You must accept the Terms of Service to use FitTrax+. Without acceptance, you cannot proceed into the app.',
      [
        { text: 'Review Terms', style: 'cancel' },
        { 
          text: 'Exit App', 
          style: 'destructive',
          onPress: () => {
            // In a real app, this would close the app
            Alert.alert('Thank You', 'We hope to see you again when you\'re ready to accept our Terms of Service.');
          }
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <LinearGradient
            colors={[accent.primary, accent.secondary || accent.primary]}
            style={styles.logoGradient}
          >
            <Ionicons name="fitness" size={28} color="#fff" />
          </LinearGradient>
        </View>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Terms of Service</Text>
        <Text style={[styles.headerSubtitle, { color: colors.text.secondary }]}>
          Please read carefully before proceeding
        </Text>
      </View>

      {/* Scrollable Terms Content */}
      <View style={[styles.termsContainer, { backgroundColor: colors.background.card, borderColor: colors.border.primary }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={true}
        >
          <Text style={[styles.termsText, { color: colors.text.primary }]}>
            {TERMS_OF_SERVICE}
          </Text>
          
          {/* Scroll indicator at bottom */}
          <View style={styles.endOfTerms}>
            <Ionicons name="checkmark-circle" size={24} color={accent.primary} />
            <Text style={[styles.endOfTermsText, { color: colors.text.secondary }]}>
              End of Terms of Service
            </Text>
          </View>
        </ScrollView>
        
        {/* Scroll hint */}
        {!hasScrolledToBottom && (
          <View style={[styles.scrollHint, { backgroundColor: colors.background.elevated }]}>
            <Ionicons name="chevron-down" size={20} color={accent.primary} />
            <Text style={[styles.scrollHintText, { color: colors.text.secondary }]}>
              Scroll to read all terms
            </Text>
          </View>
        )}
      </View>

      {/* Acceptance Section */}
      <View style={[styles.acceptanceSection, { backgroundColor: colors.background.secondary }]}>
        {/* Checkbox */}
        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setIsChecked(!isChecked)}
          activeOpacity={0.7}
        >
          <View style={[
            styles.checkbox,
            { borderColor: isChecked ? accent.primary : colors.border.primary },
            isChecked && { backgroundColor: accent.primary }
          ]}>
            {isChecked && <Ionicons name="checkmark" size={18} color="#fff" />}
          </View>
          <Text style={[styles.checkboxLabel, { color: colors.text.primary }]}>
            I have read and agree to the Terms of Service and confirm that I am at least 18 years of age.
          </Text>
        </TouchableOpacity>

        {/* Buttons */}
        <View style={styles.buttonsRow}>
          <TouchableOpacity
            style={[styles.declineButton, { borderColor: colors.border.primary }]}
            onPress={handleDecline}
          >
            <Text style={[styles.declineButtonText, { color: colors.text.secondary }]}>Decline</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.acceptButton,
              { backgroundColor: accent.primary },
              (!isChecked || isSubmitting) && styles.acceptButtonDisabled
            ]}
            onPress={handleAccept}
            disabled={!isChecked || isSubmitting}
          >
            {isSubmitting ? (
              <Text style={styles.acceptButtonText}>Accepting...</Text>
            ) : (
              <>
                <Text style={styles.acceptButtonText}>Accept & Continue</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  logoContainer: {
    marginBottom: 12,
  },
  logoGradient: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
  },
  termsContainer: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  termsText: {
    fontSize: 14,
    lineHeight: 22,
  },
  endOfTerms: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  endOfTermsText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollHint: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  scrollHintText: {
    fontSize: 13,
    fontWeight: '500',
  },
  acceptanceSection: {
    padding: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  acceptButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  acceptButtonDisabled: {
    opacity: 0.5,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
