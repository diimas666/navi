require 'xcodeproj'

project = Xcodeproj::Project.open(File.expand_path('../ios/Neiv.xcodeproj', __dir__))
target = project.targets.find { |item| item.name == 'Neiv' }
group = project.main_group.find_subpath('NativeModules', true)
group.set_source_tree('<group>')
group.set_path('NativeModules')

def add_tree(target, group, directory)
  Dir.children(directory).sort.each do |entry|
    next if entry.start_with?('.')
    absolute = File.join(directory, entry)
    if File.directory?(absolute)
      child = group.groups.find { |item| item.display_name == entry } || group.new_group(entry, entry)
      add_tree(target, child, absolute)
    elsif entry.match?(/\.(swift|m|mm|h)$/)
      reference = group.files.find { |file| file.path == entry } || group.new_file(entry)
      next unless entry.match?(/\.(swift|m|mm)$/)
      next if target.source_build_phase.files_references.include?(reference)
      target.source_build_phase.add_file_reference(reference)
    end
  end
end

add_tree(target, group, File.expand_path('../ios/NativeModules', __dir__))
project.save
