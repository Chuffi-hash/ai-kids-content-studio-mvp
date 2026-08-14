interface LessonCardProps {
  lesson: string;
}

export default function LessonCard({ lesson }: LessonCardProps) {
  return (
    <div className="lesson">
      <strong>Lesson</strong>
      <p>{lesson}</p>
    </div>
  );
}
