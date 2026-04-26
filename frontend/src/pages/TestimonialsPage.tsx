import TestimonialsSection from '../components/home/TestimonialsSection';
import PartnersSection from '../components/home/PartnersSection';
import PageHeroBanner from '../components/common/PageHeroBanner';

export default function TestimonialsPage() {
    return (
        <>
            <PageHeroBanner
                title="Student Voices & Partners"
                subtitle="See what students say about CampusWay and meet our trusted partners."
                pillText="Testimonials"
                vantaEffect="dots"
                vantaColor="#f59e0b"
                vantaBackgroundColor="#1a0f00"
                gradientFrom="#78350f"
                gradientTo="#92400e"
            />
            <div className="min-h-screen bg-background dark:bg-[#081322] space-y-16 py-10">
                <TestimonialsSection />
                <PartnersSection />
            </div>
        </>
    );
}
